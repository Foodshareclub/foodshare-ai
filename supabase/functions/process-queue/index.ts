import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Groq from "https://esm.sh/groq-sdk@0.37.0";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const REVIEW_PROMPT = `You are an expert code reviewer. Review this PR diff and return JSON:
{
  "summary": { "overview": "...", "risk_assessment": "Low|Medium|High", "recommendations": [] },
  "line_comments": [{ "path": "file.ts", "line": 1, "body": "issue", "severity": "high|medium|low" }],
  "approval_recommendation": "approve|request_changes|comment"
}
Focus on security, bugs, and performance. Return ONLY valid JSON.`;

async function ghFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", ...options?.headers },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res;
}

serve(async (req) => {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const groq = new Groq({ apiKey: GROQ_API_KEY });

  // Recover stale jobs
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await supabase
    .from("review_jobs")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("started_at", staleThreshold);

  // Find oldest pending job
  const { data: pendingJob } = await supabase
    .from("review_jobs")
    .select("id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!pendingJob) {
    return new Response(JSON.stringify({ message: "No pending jobs" }));
  }

  // Claim the job
  const { data: job, error: claimError } = await supabase
    .from("review_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", pendingJob.id)
    .eq("status", "pending")
    .select()
    .single();

  if (claimError || !job) {
    return new Response(JSON.stringify({ message: "Job claimed by another worker" }));
  }

  try {
    // Fetch PR diff
    const diffRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`, {
      headers: { Accept: "application/vnd.github.v3.diff" },
    });
    const diff = await diffRes.text();

    // Truncate diff
    const truncatedDiff = diff.length > 8000 ? diff.slice(0, 8000) + "\n...[truncated]" : diff;

    // Get PR info
    const prRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`);
    const pr = await prRes.json();

    // Call Groq
    const response = await groq.chat.completions.create({
      model: Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant",
      messages: [{ role: "user", content: `${REVIEW_PROMPT}\n\nPR: ${pr.title}\n\nDiff:\n${truncatedDiff}` }],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || "{}";
    let review;
    try {
      const json = content.includes("```") ? content.split("```")[1].replace(/^json/, "") : content;
      review = JSON.parse(json.trim());
    } catch {
      review = { summary: { overview: "Review completed", risk_assessment: "Unknown" }, line_comments: [] };
    }

    // Post review to GitHub
    const body = `## 🤖 AI Code Review\n\n${review.summary?.overview || "Review completed"}\n\n**Risk:** ${review.summary?.risk_assessment || "Unknown"}`;
    await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}/reviews`, {
      method: "POST",
      body: JSON.stringify({ body, event: "COMMENT" }),
    });

    // Save to history
    await supabase.from("review_history").insert({
      repo_full_name: job.repo_full_name,
      pr_number: job.pr_number,
      status: "completed",
      result: review,
      head_sha: pr.head.sha,
    });

    // Complete job
    await supabase
      .from("review_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id);

    return new Response(JSON.stringify({ success: true, pr: job.pr_number, repo: job.repo_full_name }));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const attempts = (job.attempts || 0) + 1;
    
    await supabase
      .from("review_jobs")
      .update({
        status: attempts >= 3 ? "failed" : "pending",
        error,
        attempts,
        next_retry_at: attempts < 3 ? new Date(Date.now() + 60000 * attempts).toISOString() : null,
      })
      .eq("id", job.id);

    return new Response(JSON.stringify({ error, job_id: job.id }), { status: 500 });
  }
});
