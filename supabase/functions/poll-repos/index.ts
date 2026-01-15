import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const env = (key: string) => Deno.env.get(key) || "";
const GITHUB_TOKEN = env("GITHUB_TOKEN");
const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const CRON_SECRET = env("CRON_SECRET");

if (!GITHUB_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error("Missing required environment variables");
}

interface PollResult {
  repos_polled: number;
  queued: string[];
  errors?: string[];
  count: number;
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
        const reset = res.headers.get("x-ratelimit-reset");
        if (reset && i < retries) {
          const delay = Math.min((parseInt(reset) * 1000 - Date.now()) + 1000, 60000);
          if (delay > 0) await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

async function getExclusionSets(supabase: any) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const [recentResult, pendingResult] = await Promise.all([
    supabase.from("review_history")
      .select("repo_full_name, pr_number, head_sha")
      .gte("created_at", since),
    supabase.from("review_jobs")
      .select("repo_full_name, pr_number")
      .in("status", ["pending", "processing", "failed"])
  ]);

  return {
    reviewed: new Set((recentResult.data || []).map((r: any) => 
      `${r.repo_full_name}#${r.pr_number}#${r.head_sha}`)),
    pending: new Set((pendingResult.data || []).map((j: any) => 
      `${j.repo_full_name}#${j.pr_number}`))
  };
}

async function processRepo(repo: any, exclusions: any, supabase: any): Promise<{ queued: string[], errors: string[] }> {
  const [owner, repoName] = repo.full_name.split("/");
  const queued: string[] = [];
  const errors: string[] = [];

  try {
    const res = await fetchWithRetry(
      `https://api.github.com/repos/${owner}/${repoName}/pulls?state=open&per_page=10`,
      { 
        headers: { 
          Authorization: `Bearer ${GITHUB_TOKEN}`, 
          Accept: "application/vnd.github+json",
          "User-Agent": "foodshare-ai-bot"
        } 
      }
    );
    
    if (!res.ok) {
      errors.push(`${repo.full_name}: ${res.status}`);
      return { queued, errors };
    }

    const prs = await res.json();
    const jobs = [];

    for (const pr of prs) {
      const prKey = `${repo.full_name}#${pr.number}`;
      const reviewKey = `${prKey}#${pr.head.sha}`;

      if (exclusions.reviewed.has(reviewKey) || exclusions.pending.has(prKey)) continue;

      jobs.push({
        repo_full_name: repo.full_name,
        pr_number: pr.number,
        owner,
        repo: repoName,
        analysis: { 
          depth: (pr.additions + pr.deletions) > 500 ? "deep" : "standard",
          title: pr.title,
        },
      });

      exclusions.pending.add(prKey);
    }

    if (jobs.length > 0) {
      const { error } = await supabase.from("review_jobs").insert(jobs);
      if (error) {
        errors.push(`${repo.full_name}: DB insert failed`);
      } else {
        queued.push(...jobs.map(j => `${j.repo_full_name}#${j.pr_number}`));
      }
    }
  } catch (err) {
    errors.push(`${repo.full_name}: ${err instanceof Error ? err.message : "Failed"}`);
  }

  return { queued, errors };
}

serve(async (req) => {
  try {
    if (CRON_SECRET && req.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: repos, error: repoError } = await supabase
      .from("repo_configs")
      .select("full_name")
      .eq("enabled", true)
      .eq("auto_review", true);

    if (repoError) throw repoError;
    if (!repos?.length) {
      return new Response(JSON.stringify({ message: "No repos configured", queued: [], count: 0 }));
    }

    const exclusions = await getExclusionSets(supabase);
    const results = await Promise.all(repos.map(repo => processRepo(repo, exclusions, supabase)));
    
    const queued = results.flatMap(r => r.queued);
    const errors = results.flatMap(r => r.errors);

    const result: PollResult = {
      repos_polled: repos.length,
      queued,
      count: queued.length,
      ...(errors.length > 0 && { errors })
    };

    return new Response(JSON.stringify(result));
  } catch (err) {
    console.error("Poll repos error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), 
      { status: 500 }
    );
  }
});
