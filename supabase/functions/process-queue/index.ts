import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Groq from "https://esm.sh/groq-sdk@0.37.0";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const REVIEW_PROMPT = `You are an elite security auditor performing a DEEP multi-pass security analysis. Your job is to find EVERY vulnerability, no matter how subtle.

## ANALYSIS METHODOLOGY
**PASS 1 - Surface Scan:** Identify obvious vulnerabilities
**PASS 2 - Deep Analysis:** Trace data flows, check trust boundaries
**PASS 3 - Verification:** Confirm findings, eliminate false positives

## OWASP TOP 10 (2021) - CHECK ALL:
A01: Broken Access Control - Missing auth, IDOR, privilege escalation, CORS misconfig
A02: Cryptographic Failures - Weak algorithms, hardcoded keys, missing encryption, bad TLS
A03: Injection - SQL, NoSQL, OS command, LDAP, XPath, template, header injection
A04: Insecure Design - Missing rate limits, business logic flaws, trust boundary violations
A05: Security Misconfiguration - Debug enabled, default creds, verbose errors, missing headers
A06: Vulnerable Components - Outdated deps, known CVEs, typosquatting packages
A07: Auth Failures - Weak passwords, missing MFA, session fixation, credential stuffing
A08: Data Integrity Failures - Insecure deserialization, unsigned updates, CI/CD tampering
A09: Logging Failures - Missing audit logs, log injection, sensitive data in logs
A10: SSRF - Unvalidated URLs, internal service access, cloud metadata exposure

## CRITICAL THREAT PATTERNS:
- **BACKDOORS:** eval(), Function(), vm.runInContext, child_process, hidden routes, magic params
- **SECRETS:** API keys, passwords, tokens, private keys, connection strings (check .env patterns)
- **DATA EXFIL:** Unauthorized fetch/axios, WebSocket to external, DNS exfiltration patterns
- **SUPPLY CHAIN:** Suspicious dependencies, postinstall scripts, typosquatting
- **LOGIC BOMBS:** Time-based triggers, conditional malicious code, obfuscated payloads

## CWE REFERENCES - Tag each finding:
CWE-79 (XSS), CWE-89 (SQLi), CWE-94 (Code Injection), CWE-78 (OS Command),
CWE-22 (Path Traversal), CWE-918 (SSRF), CWE-502 (Deserialization),
CWE-798 (Hardcoded Creds), CWE-306 (Missing Auth), CWE-862 (Missing Authz),
CWE-327 (Weak Crypto), CWE-330 (Weak Random), CWE-611 (XXE), CWE-776 (XML Bomb)

## RESPONSE FORMAT (strict JSON):
{
  "security_score": <0-100, be HARSH - 100=perfect, 0=critical breach>,
  "threat_level": "<CRITICAL|HIGH|MEDIUM|LOW|SAFE>",
  "owasp_violations": ["A01", "A03"],
  "summary": {
    "overview": "<comprehensive security assessment>",
    "critical_findings": ["<each critical issue>"],
    "risk_assessment": "<Critical|High|Medium|Low>",
    "attack_vectors": ["<how attacker could exploit>"],
    "recommendations": ["<specific fixes with code>"]
  },
  "vulnerabilities": [{
    "type": "<OWASP category or threat pattern>",
    "cwe": "<CWE-XXX>",
    "severity": "<critical|high|medium|low>",
    "cvss_estimate": <0.0-10.0>,
    "path": "<file path>",
    "line": <line number>,
    "code": "<vulnerable code>",
    "description": "<detailed explanation>",
    "impact": "<attack scenario>",
    "fix": "<exact remediation code>",
    "references": ["<relevant security docs>"]
  }],
  "line_comments": [{"path": "<file>", "line": <n>, "body": "<issue + CWE>", "severity": "<level>", "suggestion": "<fix>"}],
  "approval_recommendation": "<approve|request_changes|comment>",
  "requires_security_review": <true if CRITICAL/HIGH findings>,
  "auto_mergeable": <true only if score >= 90 and no HIGH+ findings>
}

THINK LIKE AN ATTACKER. Assume malicious intent. Miss nothing. Return ONLY valid JSON.`;

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
    // Increase limit for thorough analysis
    const truncatedDiff = diff.length > 20000 ? diff.slice(0, 20000) + "\n...[truncated]" : diff;

    // Get PR info
    const prRes = await ghFetch(`/repos/${job.owner}/${job.repo}/pulls/${job.pr_number}`);
    const pr = await prRes.json();

    // Skip if PR is closed/merged
    if (pr.state !== "open") {
      await supabase.from("review_jobs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", job.id);
      return { success: true };
    }

    // Call Groq with larger model for deep analysis
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ 
        role: "system", 
        content: "You are an elite security auditor. Be thorough and paranoid. Find ALL vulnerabilities." 
      }, { 
        role: "user", 
        content: `${REVIEW_PROMPT}\n\n## PR: ${pr.title}\n## Description: ${pr.body || "None"}\n\n## Code Diff:\n\`\`\`diff\n${truncatedDiff}\n\`\`\`` 
      }],
      temperature: 0.1,
      max_tokens: 4096,
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
    const owaspViolations = review.owasp_violations?.join(", ") || "None";
    
    let body = `## 🛡️ Deep Security Audit Report\n\n`;
    body += `| Metric | Value |\n|--------|-------|\n`;
    body += `| **Security Score** | ${securityScore}/100 |\n`;
    body += `| **Threat Level** | ${threatEmoji[threatLevel] || "⚪"} ${threatLevel} |\n`;
    body += `| **OWASP Violations** | ${owaspViolations} |\n`;
    body += `| **Auto-Mergeable** | ${review.auto_mergeable ? "✅ Yes" : "❌ No"} |\n\n`;
    body += `${review.summary?.overview || "Review completed"}\n`;

    // Attack vectors
    if (review.summary?.attack_vectors?.length) {
      body += `\n### ⚔️ Attack Vectors\n${review.summary.attack_vectors.map((a: string) => `- ${a}`).join("\n")}\n`;
    }

    // Critical findings
    if (review.summary?.critical_findings?.length) {
      body += `\n### 🚨 Critical Findings\n${review.summary.critical_findings.map((f: string) => `- ${f}`).join("\n")}\n`;
    }

    // Vulnerabilities table with CWE
    if (review.vulnerabilities?.length) {
      body += `\n### 🔍 Vulnerabilities Found\n`;
      body += `| Severity | CWE | Type | Location | Description |\n|----------|-----|------|----------|-------------|\n`;
      for (const v of review.vulnerabilities.slice(0, 15)) {
        const sev = v.severity?.toUpperCase() || "MEDIUM";
        const cvss = v.cvss_estimate ? ` (${v.cvss_estimate})` : "";
        body += `| ${threatEmoji[sev] || "⚪"} ${sev}${cvss} | ${v.cwe || "N/A"} | ${v.type || "Unknown"} | \`${v.path}:${v.line}\` | ${(v.description || "").slice(0, 50)}... |\n`;
      }
    }

    if (review.summary?.recommendations?.length) {
      body += `\n### 📋 Recommendations\n${review.summary.recommendations.map((r: string) => `- ${r}`).join("\n")}`;
    }

    // Auto-merge/block decision
    if (review.requires_security_review) {
      body += `\n\n---\n⚠️ **This PR requires manual security review before merging.**`;
    } else if (review.auto_mergeable) {
      body += `\n\n---\n✅ **This PR passed security checks and is safe to merge.**`;
    }

    // Prepare line comments with CWE references
    const comments = (review.line_comments || [])
      .filter((c: any) => c.path && c.line > 0)
      .slice(0, 15)
      .map((c: any) => ({
        path: c.path,
        line: c.line,
        body: `**[${(c.severity || "info").toUpperCase()}]** ${c.body}${c.suggestion ? `\n\n\`\`\`suggestion\n${c.suggestion}\n\`\`\`` : ""}`,
      }));

    // Determine review action based on findings
    let event: string;
    if (threatLevel === "CRITICAL" || (review.security_score !== undefined && review.security_score < 50)) {
      event = "REQUEST_CHANGES"; // Block critical PRs
    } else if (review.auto_mergeable && review.security_score >= 90) {
      event = "APPROVE"; // Auto-approve safe PRs
    } else {
      event = review.approval_recommendation === "approve" ? "APPROVE" 
        : review.approval_recommendation === "request_changes" ? "REQUEST_CHANGES" : "COMMENT";
    }
    
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
