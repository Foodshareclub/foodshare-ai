import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

serve(async (req) => {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get enabled repos
  const { data: repos } = await supabase
    .from("repo_configs")
    .select("full_name")
    .eq("enabled", true)
    .eq("auto_review", true);

  if (!repos?.length) {
    return new Response(JSON.stringify({ message: "No repos configured", queued: 0 }));
  }

  // Get recent reviews to skip (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("review_history")
    .select("repo_full_name, pr_number, head_sha")
    .gte("created_at", since);

  const reviewedSet = new Set((recent || []).map(r => `${r.repo_full_name}#${r.pr_number}#${r.head_sha}`));

  // Get pending jobs to skip
  const { data: pending } = await supabase
    .from("review_jobs")
    .select("repo_full_name, pr_number")
    .in("status", ["pending", "processing"]);

  const pendingSet = new Set((pending || []).map(j => `${j.repo_full_name}#${j.pr_number}`));

  const queued: string[] = [];
  const errors: string[] = [];

  for (const repo of repos) {
    const [owner, repoName] = repo.full_name.split("/");

    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/pulls?state=open&per_page=20`,
        { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } }
      );
      
      if (!res.ok) {
        errors.push(`${repo.full_name}: GitHub API ${res.status}`);
        continue;
      }

      const prs = await res.json();

      for (const pr of prs.slice(0, 10)) {
        const prKey = `${repo.full_name}#${pr.number}`;
        const reviewKey = `${repo.full_name}#${pr.number}#${pr.head.sha}`;

        // Skip if already reviewed at this SHA or pending
        if (reviewedSet.has(reviewKey) || pendingSet.has(prKey)) continue;

        const { error } = await supabase.from("review_jobs").insert({
          repo_full_name: repo.full_name,
          pr_number: pr.number,
          owner,
          repo: repoName,
          analysis: { 
            depth: pr.additions + pr.deletions > 500 ? "deep" : "standard",
            title: pr.title,
          },
        });

        if (!error) {
          queued.push(prKey);
          pendingSet.add(prKey); // Prevent duplicate in same run
        }
      }
    } catch (err) {
      errors.push(`${repo.full_name}: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  return new Response(JSON.stringify({ 
    repos_polled: repos.length, 
    queued, 
    errors: errors.length > 0 ? errors : undefined,
    count: queued.length,
  }));
});
