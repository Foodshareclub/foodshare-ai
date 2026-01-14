import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

serve(async (req) => {
  // Verify auth
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
    return new Response(JSON.stringify({ message: "No repos", queued: 0 }));
  }

  // Get recent reviews to skip
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

  for (const repo of repos) {
    const [owner, repoName] = repo.full_name.split("/");

    try {
      // Fetch open PRs from GitHub
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/pulls?state=open&per_page=20`,
        { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } }
      );
      if (!res.ok) continue;

      const prs = await res.json();

      for (const pr of prs.slice(0, 10)) {
        const prKey = `${repo.full_name}#${pr.number}`;
        const reviewKey = `${repo.full_name}#${pr.number}#${pr.head.sha}`;

        if (reviewedSet.has(reviewKey) || pendingSet.has(prKey)) continue;

        // Enqueue
        const { error } = await supabase.from("review_jobs").insert({
          repo_full_name: repo.full_name,
          pr_number: pr.number,
          owner,
          repo: repoName,
          analysis: { depth: "standard", focus_areas: [] },
        });

        if (!error) queued.push(prKey);
      }
    } catch { /* skip repo */ }
  }

  // Trigger worker if jobs queued
  if (queued.length > 0) {
    fetch(`${APP_URL}/api/worker`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ repos: repos.length, queued, count: queued.length }));
});
