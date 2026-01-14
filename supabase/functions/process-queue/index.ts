import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Groq from "https://esm.sh/groq-sdk@0.37.0";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const REVIEW_PROMPT = `You are an elite security auditor and code reviewer. Perform a DEEP SECURITY AUDIT of this PR.

## CRITICAL: Scan for these threats

### 1. INJECTION ATTACKS
- SQL injection (raw queries, string concatenation)
- Command injection (exec, spawn, system calls)
- XSS (innerHTML, dangerouslySetInnerHTML, unsanitized output)
- Template injection
- LDAP/XML/XPath injection

### 2. AUTHENTICATION & AUTHORIZATION
- Hardcoded credentials, API keys, tokens, passwords
- Weak authentication logic
- Missing authorization checks
- JWT vulnerabilities (none algorithm, weak secrets)
- Session fixation/hijacking

### 3. DATA EXPOSURE & LEAKS
- Sensitive data in logs (passwords, tokens, PII)
- Exposed secrets in error messages
- Insecure data transmission
- Missing encryption for sensitive data
- .env files, config leaks

### 4. BACKDOORS & MALICIOUS CODE
- Suspicious eval(), Function(), new Function()
- Obfuscated code
- Hidden endpoints or admin routes
- Unexpected network calls
- Crypto mining, data exfiltration patterns

### 5. DEPENDENCY & SUPPLY CHAIN
- Known vulnerable packages
- Typosquatting packages
- Suspicious postinstall scripts

### 6. LOGIC FLAWS
- Race conditions
- TOCTOU (time-of-check to time-of-use)
- Integer overflow/underflow
- Null pointer dereference
- Improper error handling exposing internals

### 7. INFRASTRUCTURE
- SSRF vulnerabilities
- Path traversal (../)
- Insecure deserialization
- Missing rate limiting
- CORS misconfigurations

## Output JSON:
{
  "security_score": 0-100,
  "threat_level": "CRITICAL|HIGH|MEDIUM|LOW|SAFE",
  "summary": { 
    "overview": "security assessment summary",
    "critical_findings": ["list of critical issues"],
    "risk_assessment": "Critical|High|Medium|Low",
    "recommendations": ["prioritized fixes"]
  },
  "vulnerabilities": [{
    "type": "SQL_INJECTION|XSS|HARDCODED_SECRET|BACKDOOR|etc",
    "severity": "critical|high|medium|low",
    "path": "file.ts",
    "line": 42,
    "code": "vulnerable code snippet",
    "description": "detailed explanation",
    "fix": "how to fix it",
    "cwe": "CWE-XXX if applicable"
  }],
  "line_comments": [{ "path": "file.ts", "line": 10, "body": "issue", "severity": "critical|high|medium|low", "suggestion": "fix" }],
  "approval_recommendation": "approve|request_changes|comment"
}

BE PARANOID. Assume malicious intent. Flag anything suspicious. Return ONLY valid JSON.`;

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
    const threatEmoji: Record<string, string> = { CRITICAL: "🚨", HIGH: "🔴", MEDIUM: "🟠", LOW: "🟡", SAFE: "🟢" };
    const threatLevel = review.threat_level || "MEDIUM";
    const securityScore = review.security_score ?? "N/A";
    
    let body = `## 🛡️ Security Audit Report\n\n`;
    body += `**Security Score:** ${securityScore}/100 | **Threat Level:** ${threatEmoji[threatLevel] || "⚪"} ${threatLevel}\n\n`;
    body += `${review.summary?.overview || "Review completed"}\n`;

    // Critical findings
    if (review.summary?.critical_findings?.length) {
      body += `\n### 🚨 Critical Findings\n${review.summary.critical_findings.map((f: string) => `- ${f}`).join("\n")}\n`;
    }

    // Vulnerabilities table
    if (review.vulnerabilities?.length) {
      body += `\n### 🔍 Vulnerabilities Found\n`;
      body += `| Severity | Type | File | Description |\n|----------|------|------|-------------|\n`;
      for (const v of review.vulnerabilities.slice(0, 10)) {
        const sev = v.severity?.toUpperCase() || "MEDIUM";
        body += `| ${threatEmoji[sev] || "⚪"} ${sev} | ${v.type || "Unknown"} | \`${v.path}:${v.line}\` | ${(v.description || "").slice(0, 60)}... |\n`;
      }
    }

    if (review.summary?.recommendations?.length) {
      body += `\n### 📋 Recommendations\n${review.summary.recommendations.map((r: string) => `- ${r}`).join("\n")}`;
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
