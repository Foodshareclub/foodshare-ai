import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chat } from "../_shared/llm.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCAN_PROMPT = `Analyze this code for security vulnerabilities, bugs, and quality issues.

Categories:
- SECURITY: SQL injection, XSS, hardcoded secrets, missing auth, unsafe eval, env leaks
- BUG: null checks, async errors, race conditions, type mismatches
- QUALITY: long functions, magic numbers, dead code, missing error handling

Return JSON array (empty if clean):
[{"severity":"critical|high|medium|low","type":"security|bug|quality","title":"<issue>","file":"<path>","line":<num>,"problem":"<description>","fix":"<suggestion>"}]`;

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
        .filter((f) => f.type === "blob" && f.size > 50 && f.size < 50000)
        .filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php)$/i.test(f.path))
        .filter((f) => !/(node_modules|vendor|dist|build|\.min\.|test|spec|__pycache__|\.next|\.git)/i.test(f.path))
        .sort((a, b) => {
          const priority = (p: string) => /auth|login|secret|api|route|database|payment|admin/i.test(p) ? 0 : 10;
          return priority(a.path) - priority(b.path);
        })
        .map((f) => f.path)
        .slice(0, 25);
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
    if (charCount >= 8000) break;
    const content = await getFileContent(owner, repo, path);
    if (content.length > 30) {
      const snippet = content.slice(0, 1200);
      charCount += snippet.length;
      codeBlocks.push(`=== ${path} ===\n${snippet}`);
    }
  }

  if (!codeBlocks.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no content" };

  const code = codeBlocks.join("\n\n").slice(0, 8000);
  
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
