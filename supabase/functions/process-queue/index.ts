import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chat, getLLMStatus } from "../_shared/llm.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;
const RATE_LIMIT_DELAY = 300000;

interface JobResult {
  success: boolean;
  error?: string;
  retryable?: boolean;
}

function log(level: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logData = data ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}${logData}`);
}

function calculateBackoff(attempt: number, isRateLimit = false): number {
  if (isRateLimit) return RATE_LIMIT_DELAY;
  return BASE_DELAY * Math.pow(2, attempt - 1);
}

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

async function ghFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: { 
        Authorization: `Bearer ${GITHUB_TOKEN}`, 
        Accept: "application/vnd.github+json", 
        ...options?.headers 
      },
    });
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      const error = new Error(`GitHub API ${res.status}: ${errorText}`);
      (error as any).status = res.status;
      (error as any).retryable = res.status >= 500 || res.status === 429;
      throw error;
    }
    
    return res;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      const networkError = new Error(`Network error: ${err.message}`);
      (networkError as any).retryable = true;
      throw networkError;
    }
    throw err;
  }
}

async function processJob(supabase: ReturnType<typeof createClient>, job: Record<string, unknown>): Promise<JobResult> {
  const jobId = `${job.repo_full_name}#${job.pr_number}`;
  log('info', `Processing job ${jobId}`, { jobId: job.id });

  try {
    // Fetch PR diff
    const diffRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`, {
      headers: { Accept: "application/vnd.github.v3.diff" },
    });
    const diff = await diffRes.text();
    const truncatedDiff = diff.length > 20000 ? diff.slice(0, 20000) + "\n...[truncated]" : diff;

    // Fetch PR details
    const prRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`);
    const pr = await prRes.json();

    if (pr.state !== "open") {
      log('info', `PR ${jobId} is not open, marking as completed`);
      await supabase.from("review_jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
      return { success: true };
    }

    // Generate review using LLM
    log('info', `Generating review for ${jobId}`);
    const content = await chat(
      `${REVIEW_PROMPT}\n\n## PR: ${pr.title}\n## Description: ${pr.body || "None"}\n\n## Code Diff:\n\`\`\`diff\n${truncatedDiff}\n\`\`\``,
      { useReviewModel: true, systemPrompt: "You are an elite security auditor. Be thorough." }
    );

    // Parse review response
    let review: Record<string, unknown>;
    try {
      let json = content;
      if (json.includes("```json")) json = json.split("```json")[1].split("```")[0];
      else if (json.includes("```")) json = json.split("```")[1].split("```")[0];
      review = JSON.parse(json.trim());
    } catch (parseErr) {
      log('warn', `Failed to parse LLM response for ${jobId}`, { error: parseErr instanceof Error ? parseErr.message : 'Unknown' });
      review = { summary: { overview: "Review completed" }, line_comments: [] };
    }

    // Format review content
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

    // Submit review to GitHub
    try {
      await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}/reviews`, {
        method: "POST",
        body: JSON.stringify({ body, event, comments: comments.length > 0 ? comments : undefined }),
      });
      log('info', `Review submitted for ${jobId}`, { event, commentsCount: comments.length });
    } catch (reviewErr) {
      log('warn', `Failed to submit review with comments for ${jobId}, retrying without comments`);
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

    // Mark job as completed
    await supabase.from("review_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", job.id);

    log('info', `Job ${jobId} completed successfully`);
    return { success: true };

  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const isRetryable = (err as any)?.retryable || false;
    const isRateLimit = error.includes("rate") || error.includes("429") || (err as any)?.status === 429;
    const attempts = ((job.attempts as number) || 0) + 1;
    
    log('error', `Job ${jobId} failed (attempt ${attempts})`, { 
      error, 
      isRetryable, 
      isRateLimit,
      status: (err as any)?.status 
    });

    const shouldRetry = attempts < MAX_RETRIES && (isRetryable || isRateLimit);
    const nextRetryDelay = calculateBackoff(attempts, isRateLimit);
    
    await supabase.from("review_jobs").update({
      status: shouldRetry ? "pending" : "failed",
      error,
      attempts,
      next_retry_at: shouldRetry ? new Date(Date.now() + nextRetryDelay).toISOString() : null,
    }).eq("id", job.id);

    return { success: false, error, retryable: shouldRetry };
  }
}

serve(async (req) => {
  const startTime = Date.now();
  log('info', 'Queue processing started');

  try {
    // Authentication check
    const authHeader = req.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      log('warn', 'Unauthorized access attempt');
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const results: { pr: string; success: boolean; error?: string; retryable?: boolean }[] = [];

    // Reset stuck jobs
    const { error: resetError } = await supabase
      .from("review_jobs")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("started_at", new Date(Date.now() - 600000).toISOString());

    if (resetError) {
      log('warn', 'Failed to reset stuck jobs', { error: resetError.message });
    }

    // Process jobs
    for (let i = 0; i < 3 && Date.now() - startTime < 50000; i++) {
      try {
        // Find next pending job
        const { data: pendingJob, error: findError } = await supabase
          .from("review_jobs")
          .select("id")
          .eq("status", "pending")
          .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (findError || !pendingJob) {
          if (findError && findError.code !== 'PGRST116') {
            log('warn', 'Error finding pending jobs', { error: findError.message });
          }
          break;
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
          if (claimError) {
            log('warn', 'Failed to claim job', { jobId: pendingJob.id, error: claimError.message });
          }
          continue;
        }

        // Process the job
        const result = await processJob(supabase, job);
        results.push({ pr: `${job.repo_full_name}#${job.pr_number}`, ...result });

        // Break on rate limit
        if (result.error?.includes("rate") || result.error?.includes("429")) {
          log('warn', 'Rate limit hit, stopping processing');
          break;
        }
      } catch (loopErr) {
        log('error', 'Error in processing loop', { 
          iteration: i, 
          error: loopErr instanceof Error ? loopErr.message : 'Unknown' 
        });
        break;
      }
    }

    const duration = Date.now() - startTime;
    const llmStatus = getLLMStatus();
    
    log('info', 'Queue processing completed', { 
      processed: results.length, 
      duration_ms: duration,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return new Response(JSON.stringify({ 
      processed: results.length, 
      results, 
      duration_ms: duration, 
      llm: llmStatus 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err instanceof Error ? err.message : 'Unknown error';
    
    log('error', 'Fatal error in queue processing', { error, duration_ms: duration });
    
    return new Response(JSON.stringify({ 
      error: "Internal server error", 
      duration_ms: duration 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
