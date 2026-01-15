import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chat, getLLMStatus } from "../_shared/llm.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const REVIEW_PROMPT = `You are an elite security auditor. Find ALL vulnerabilities.

## OWASP TOP 10:
A01: Broken Access Control  A02: Cryptographic Failures  A03: Injection
A04: Insecure Design  A05: Security Misconfiguration  A06: Vulnerable Components
A07: Auth Failures  A08: Data Integrity Failures  A09: Logging Failures  A10: SSRF

## RESPONSE FORMAT (strict JSON):
{
  "security_score": <0-100>,
  "threat_level": "<CRITICAL|HIGH|MEDIUM|LOW|SAFE>",
  "owasp_violations": ["A01"],
  "summary": {"overview": "<assessment>", "critical_findings": [], "recommendations": []},
  "vulnerabilities": [{"type": "<category>", "severity": "<critical|high|medium|low>", "path": "<file>", "line": <n>, "description": "<issue>", "fix": "<solution>"}],
  "line_comments": [{"path": "<file>", "line": <n>, "body": "<issue>", "severity": "<level>", "suggestion": "<fix>"}],
  "approval_recommendation": "<approve|request_changes|comment>",
  "auto_mergeable": <true if score >= 90>
}
Return ONLY valid JSON.`;

async function ghFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", ...options?.headers },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res;
}

async function processJob(supabase: ReturnType<typeof createClient>, job: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  try {
    const diffRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`, {
      headers: { Accept: "application/vnd.github.v3.diff" },
    });
    const diff = await diffRes.text();
    const truncatedDiff = diff.length > 20000 ? diff.slice(0, 20000) + "\n...[truncated]" : diff;

    const prRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`);
    const pr = await prRes.json();

    if (pr.state !== "open") {
      await supabase.from("review_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
      return { success: true };
    }

    const content = await chat(
      `${REVIEW_PROMPT}\n\n## PR: ${pr.title}\n## Description: ${pr.body || "None"}\n\n## Code Diff:\n\`\`\`diff\n${truncatedDiff}\n\`\`\``,
      { useReviewModel: true, systemPrompt: "You are an elite security auditor. Be thorough." }
    );

    let review: Record<string, unknown>;
    try {
      let json = content;
      if (json.includes("```json")) json = json.split("```json")[1].split("```")[0];
      else if (json.includes("```")) json = json.split("```")[1].split("```")[0];
      review = JSON.parse(json.trim());
    } catch {
      review = { summary: { overview: "Review completed" }, line_comments: [] };
    }

    const threatEmoji: Record<string, string> = { CRITICAL: "🚨", HIGH: "🔴", MEDIUM: "🟠", LOW: "🟡", SAFE: "🟢" };
    const threatLevel = (review.threat_level as string) || "MEDIUM";
    
    let body = `## 🛡️ Security Audit\n\n| Metric | Value |\n|--------|-------|\n`;
    body += `| **Score** | ${review.security_score ?? "N/A"}/100 |\n`;
    body += `| **Threat** | ${threatEmoji[threatLevel] || "⚪"} ${threatLevel} |\n`;
    body += `| **OWASP** | ${(review.owasp_violations as string[])?.join(", ") || "None"} |\n\n`;
    body += `${(review.summary as Record<string, unknown>)?.overview || "Review completed"}\n`;

    const summaryObj = review.summary as Record<string, unknown> | undefined;
    if ((summaryObj?.critical_findings as string[])?.length) {
      body += `\n### 🚨 Critical\n${(summaryObj.critical_findings as string[]).map((f: string) => `- ${f}`).join("\n")}\n`;
    }
    if ((summaryObj?.recommendations as string[])?.length) {
      body += `\n### 📋 Recommendations\n${(summaryObj.recommendations as string[]).map((r: string) => `- ${r}`).join("\n")}`;
    }

    const comments = ((review.line_comments as Array<Record<string, unknown>>) || [])
      .filter((c) => c.path && (c.line as number) > 0)
      .slice(0, 10)
      .map((c) => ({ path: c.path, line: c.line, body: `**[${((c.severity as string) || "info").toUpperCase()}]** ${c.body}` }));

    const event = threatLevel === "CRITICAL" ? "REQUEST_CHANGES" : (review.auto_mergeable ? "APPROVE" : "COMMENT");

    try {
      await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}/reviews`, {
        method: "POST",
        body: JSON.stringify({ body, event, comments: comments.length > 0 ? comments : undefined }),
      });
    } catch {
      await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}/reviews`, {
        method: "POST",
        body: JSON.stringify({ body, event: "COMMENT" }),
      });
    }

    await supabase.from("review_history").insert({
      repo_full_name: job.repo_full_name,
      pr_number: job.pr_number,
      status: "completed",
      result: review,
      head_sha: pr.head.sha,
    });

    await supabase.from("review_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const attempts = ((job.attempts as number) || 0) + 1;
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
  const startTime = Date.now();
  const results: { pr: string; success: boolean; error?: string }[] = [];

  await supabase.from("review_jobs").update({ status: "pending" }).eq("status", "processing").lt("started_at", new Date(Date.now() - 600000).toISOString());

  for (let i = 0; i < 3 && Date.now() - startTime < 50000; i++) {
    const { data: pendingJob } = await supabase
      .from("review_jobs")
      .select("id")
      .eq("status", "pending")
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!pendingJob) break;

    const { data: job } = await supabase
      .from("review_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", pendingJob.id)
      .eq("status", "pending")
      .select()
      .single();

    if (!job) continue;

    const result = await processJob(supabase, job);
    results.push({ pr: `${job.repo_full_name}#${job.pr_number}`, ...result });

    if (result.error?.includes("rate") || result.error?.includes("429")) break;
  }

  const llmStatus = getLLMStatus();
  return new Response(JSON.stringify({ processed: results.length, results, duration_ms: Date.now() - startTime, llm: llmStatus }));
});
