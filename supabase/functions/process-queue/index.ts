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
  "summary": { "overview": "1-2 sentence summary", "risk_assessment": "Low|Medium|High", "recommendations": ["action items"] },
  "line_comments": [{ "path": "file.ts", "line": 10, "body": "issue description", "severity": "critical|high|medium|low", "suggestion": "optional fix" }],
  "approval_recommendation": "approve|request_changes|comment"
}
Focus on: security vulnerabilities, bugs, performance issues. Be concise. Return ONLY valid JSON.`;

async function ghFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", ...options?.headers },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res;
}

async function processJob(supabase: any, groq: any, job: any): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch PR diff
    const diffRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`, {
      headers: { Accept: "application/vnd.github.v3.diff" },
    });
    const diff = await diffRes.text();
    const truncatedDiff = diff.length > 12000 ? diff.slice(0, 12000) + "\n...[truncated]" : diff;

    // Get PR info
    const prRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`);
    const pr = await prRes.json();

    // Skip if PR is closed/merged
    if (pr.state !== "open") {
      await supabase.from("review_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
      return { success: true };
    }

    // Call Groq
    const response = await groq.chat.completions.create({
      model: Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: `${REVIEW_PROMPT}\n\nPR: ${pr.title}\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\`` }],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || "{}";
    let review;
    try {
      let json = content;
      if (json.includes("```json")) json = json.split("```json")[1].split("```")[0];
      else if (json.includes("```")) json = json.split("```")[1].split("```")[0];
      review = JSON.parse(json.trim());
    } catch {
      review = { summary: { overview: "Review completed", risk_assessment: "Unknown" }, line_comments: [] };
    }

    // Build review body
    const riskEmoji = { Low: "🟢", Medium: "🟡", High: "🔴" }[review.summary?.risk_assessment] || "⚪";
    let body = `## 🤖 AI Code Review\n\n${review.summary?.overview || "Review completed"}\n\n**Risk:** ${riskEmoji} ${review.summary?.risk_assessment || "Unknown"}`;
    
    if (review.summary?.recommendations?.length) {
      body += `\n\n### Recommendations\n${review.summary.recommendations.map((r: string) => `- ${r}`).join("\n")}`;
    }

    // Prepare line comments
    const comments = (review.line_comments || [])
      .filter((c: any) => c.path && c.line > 0)
      .slice(0, 10) // Limit to 10 comments
      .map((c: any) => ({
        path: c.path,
        line: c.line,
        body: `**[${(c.severity || "info").toUpperCase()}]** ${c.body}${c.suggestion ? `\n\n\`\`\`suggestion\n${c.suggestion}\n\`\`\`` : ""}`,
      }));

    // Post review to GitHub
    const event = review.approval_recommendation === "approve" ? "APPROVE" 
      : review.approval_recommendation === "request_changes" ? "REQUEST_CHANGES" : "COMMENT";
    
    try {
      await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}/reviews`, {
        method: "POST",
        body: JSON.stringify({ body, event, comments: comments.length > 0 ? comments : undefined }),
      });
    } catch {
      // Retry without line comments if it fails
      await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}/reviews`, {
        method: "POST",
        body: JSON.stringify({ body, event: "COMMENT" }),
      });
    }

    // Save to history
    await supabase.from("review_history").insert({
      repo_full_name: job.repo_full_name,
      pr_number: job.pr_number,
      status: "completed",
      result: review,
      head_sha: pr.head.sha,
    });

    // Complete job
    await supabase.from("review_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const attempts = (job.attempts || 0) + 1;
    const isRateLimit = error.includes("rate") || error.includes("429");
    
    await supabase.from("review_jobs").update({
      status: attempts >= 3 && !isRateLimit ? "failed" : "pending",
      error,
      attempts,
      next_retry_at: new Date(Date.now() + (isRateLimit ? 300000 : 60000 * attempts)).toISOString(),
    }).eq("id", job.id);

    return { success: false, error };
  }
}

serve(async (req) => {
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const groq = new Groq({ apiKey: GROQ_API_KEY });
  const startTime = Date.now();
  const results: { pr: string; success: boolean; error?: string }[] = [];

  // Recover stale jobs (processing > 10 min)
  await supabase
    .from("review_jobs")
    .update({ status: "pending" })
    .eq("status", "processing")
    .lt("started_at", new Date(Date.now() - 600000).toISOString());

  // Process up to 3 jobs per invocation (stay under 60s limit)
  for (let i = 0; i < 3 && Date.now() - startTime < 50000; i++) {
    // Find next job (respecting retry delay)
    const { data: pendingJob } = await supabase
      .from("review_jobs")
      .select("id")
      .eq("status", "pending")
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!pendingJob) break;

    // Claim job
    const { data: job } = await supabase
      .from("review_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", pendingJob.id)
      .eq("status", "pending")
      .select()
      .single();

    if (!job) continue;

    const result = await processJob(supabase, groq, job);
    results.push({ pr: `${job.repo_full_name}#${job.pr_number}`, ...result });
    
    // Stop if rate limited
    if (result.error?.includes("rate") || result.error?.includes("429")) break;
  }

  return new Response(JSON.stringify({ 
    processed: results.length,
    results,
    duration_ms: Date.now() - startTime,
  }));
});
