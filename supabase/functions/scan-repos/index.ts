import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chat } from "../_shared/llm.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCAN_PROMPT = `You are a senior security engineer performing a THOROUGH code audit. Analyze this code deeply for:

## SECURITY (Critical Priority)
- SQL/NoSQL injection vulnerabilities
- XSS (Cross-Site Scripting) - reflected, stored, DOM-based
- Authentication/Authorization flaws - broken auth, privilege escalation
- Sensitive data exposure - hardcoded secrets, API keys, passwords, tokens
- CSRF vulnerabilities
- Insecure deserialization
- Server-Side Request Forgery (SSRF)
- Path traversal / Local File Inclusion
- Command injection
- Insecure cryptography
- Missing security headers
- CORS misconfigurations

## BUGS (High Priority)
- Null/undefined reference errors
- Race conditions and concurrency issues
- Memory leaks
- Unhandled promise rejections
- Type coercion bugs
- Off-by-one errors
- Resource leaks (unclosed connections, file handles)
- Infinite loops potential
- Integer overflow/underflow

## QUALITY (Medium Priority)
- Functions over 50 lines
- Deeply nested code (>3 levels)
- Duplicated code blocks
- Missing error handling
- Console.log/print statements in production
- TODO/FIXME/HACK comments
- Unused variables/imports
- Magic numbers without constants

Be AGGRESSIVE - report ALL issues found. Better to over-report than miss vulnerabilities.

Return JSON array (empty [] ONLY if code is perfect):
[{"severity":"critical|high|medium|low","type":"security|bug|quality","title":"<concise issue>","file":"<path>","line":<number>,"problem":"<detailed explanation>","fix":"<specific code fix or recommendation>","cwe":"<CWE-ID if applicable>"}]`;

const ghFetch = async (endpoint: string) => {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "FoodShare-Scan" };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
};

async function getRepoFiles(owner: string, repo: string): Promise<string[]> {
  for (const branch of ["main", "master", "develop"]) {
    try {
      const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`) as { tree?: Array<{ type: string; size: number; path: string }> };
      return (tree.tree || [])
        .filter((f) => f.type === "blob" && f.size > 50 && f.size < 100000)
        .filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|swift|kt|cs|c|cpp|h)$/i.test(f.path))
        .filter((f) => !/(node_modules|vendor|dist|build|\.min\.|__tests__|__mocks__|\.test\.|\.spec\.|__pycache__|\.next|\.git|coverage)/i.test(f.path))
        .sort((a, b) => {
          // Prioritize security-sensitive files
          const priority = (p: string) => {
            if (/auth|login|password|secret|token|api|admin|payment|crypto|session/i.test(p)) return 0;
            if (/route|controller|handler|middleware|service/i.test(p)) return 1;
            if (/database|model|schema|migration/i.test(p)) return 2;
            if (/config|env|setting/i.test(p)) return 3;
            return 10;
          };
          return priority(a.path) - priority(b.path);
        })
        .map((f) => f.path)
        .slice(0, 50); // Increased from 25 to 50 files
    } catch { continue; }
  }
  return [];
}

async function getFileContent(owner: string, repo: string, path: string): Promise<string> {
  try {
    const file = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`) as { encoding?: string; content?: string };
    if (file.encoding === "base64" && file.content) return atob(file.content.replace(/\n/g, ""));
  } catch {}
  return "";
}

async function scanRepo(owner: string, repo: string): Promise<Record<string, unknown>> {
  const files = await getRepoFiles(owner, repo);
  if (!files.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no files" };

  const codeBlocks: string[] = [];
  let charCount = 0;

  for (const path of files) {
    if (charCount >= 15000) break; // Increased from 8000 to 15000
    const content = await getFileContent(owner, repo, path);
    if (content.length > 30) {
      const snippet = content.slice(0, 2000); // Increased from 1200 to 2000
      charCount += snippet.length;
      codeBlocks.push(`=== ${path} ===\n${snippet}`);
    }
  }

  if (!codeBlocks.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no content" };

  const code = codeBlocks.join("\n\n").slice(0, 15000); // Increased limit
  
  let findings: Array<Record<string, unknown>> = [];
  try {
    const response = await chat(`${SCAN_PROMPT}\n\n${code}`, { temperature: 0.2, maxTokens: 2000, timeout: 180000 });
    let json = response.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const start = json.indexOf("["), end = json.lastIndexOf("]") + 1;
    if (start >= 0 && end > start) json = json.slice(start, end);
    findings = JSON.parse(json);
  } catch (e) {
    console.error(`Scan parse error: ${e}`);
  }

  const c = findings.filter((f) => f.severity === "critical").length;
  const h = findings.filter((f) => f.severity === "high").length;
  const m = findings.filter((f) => f.severity === "medium").length;
  const l = findings.filter((f) => f.severity === "low").length;

  const score = Math.max(0, Math.min(100, 100 - c * 25 - h * 15 - m * 5 - l * 2));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const threat = c > 0 ? "CRITICAL" : h > 0 ? "HIGH" : m > 0 ? "MEDIUM" : l > 0 ? "LOW" : "SAFE";

  return {
    repo: `${owner}/${repo}`, score, grade, threat_level: threat,
    summary: `Scanned ${codeBlocks.length} files. Found ${findings.length} issues: ${c} critical, ${h} high, ${m} medium, ${l} low.`,
    by_severity: { critical: c, high: h, medium: m, low: l },
    files_analyzed: codeBlocks.length,
    findings,
  };
}

serve(async (req) => {
  const start = Date.now();
  const url = new URL(req.url);
  const testRepo = url.searchParams.get("repo");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const repos = testRepo
    ? [{ full_name: testRepo }]
    : (await supabase.from("repo_configs").select("full_name").eq("enabled", true)).data;

  if (!repos?.length) return Response.json({ error: "No repos configured" }, { status: 400 });

  const results = [];
  for (const repo of repos) {
    if (Date.now() - start > 280000) break; // 4.5 min safety margin
    const [owner, name] = repo.full_name.split("/");
    try {
      console.log(`Scanning ${repo.full_name}...`);
      const result = await scanRepo(owner, name);
      results.push(result);
      
      if (!result.skipped) {
        await supabase.from("security_scans").insert({
          repo_full_name: repo.full_name,
          security_score: result.score,
          issues: result.findings,
          summary: result.summary,
          files_scanned: result.files_analyzed,
          scan_metadata: { grade: result.grade, threat_level: result.threat_level, by_severity: result.by_severity },
        });
      }
    } catch (e) {
      results.push({ repo: repo.full_name, error: String(e).slice(0, 100) });
    }
  }

  return Response.json({ 
    repos_scanned: results.length, 
    duration_s: ((Date.now() - start) / 1000).toFixed(1), 
    results 
  });
});
