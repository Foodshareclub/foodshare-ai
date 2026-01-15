import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chat, getLLMStatus } from "../_shared/llm.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SECURITY_PROMPT = `Find ALL security vulnerabilities. Report: env var access without validation, unsanitized input, SQL injection, hardcoded secrets, missing auth, eval/innerHTML, CORS issues. Be aggressive.`;
const BUG_PROMPT = `Find ALL bugs: missing null checks, async without try/catch, missing await, race conditions, off-by-one errors. Be aggressive.`;
const QUALITY_PROMPT = `Find ALL quality issues: long functions, deep nesting, magic numbers, repeated code, unclear names, console.log, TODOs. Be aggressive.`;

const SCAN_FORMAT = `Return JSON array: [{"severity":"critical|high|medium|low","category":"<type>","title":"<issue>","file":"<path>","line":<num>,"problem":"<why>","fix":"<how>"}]. Return [] if perfect.`;

async function ghFetch(endpoint: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "FoodShare-Scan" };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

async function getRepoFiles(owner: string, repo: string): Promise<string[]> {
  for (const branch of ["main", "master", "develop"]) {
    try {
      const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`) as { tree?: Array<{ type: string; size: number; path: string }> };
      return (tree.tree || [])
        .filter((f) => f.type === "blob" && f.size > 50 && f.size < 80000)
        .filter((f) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php)$/i.test(f.path))
        .filter((f) => !/(node_modules|vendor|dist|build|\.min\.|test|spec|__pycache__|\.next)/i.test(f.path))
        .sort((a, b) => {
          const priority = (p: string) => /auth|login|secret|api|route|database|payment/i.test(p) ? 0 : 10;
          return priority(a.path) - priority(b.path);
        })
        .map((f) => f.path)
        .slice(0, 30);
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

async function runScan(scanType: string, prompt: string, code: string): Promise<Array<Record<string, unknown>>> {
  try {
    const content = await chat(`${prompt}\n\n${SCAN_FORMAT}\n\n${code}`, { temperature: 0.3, maxTokens: 2000 });
    let json = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const start = json.indexOf("["), end = json.lastIndexOf("]") + 1;
    if (start >= 0 && end > start) json = json.slice(start, end);
    return JSON.parse(json);
  } catch (e) {
    console.error(`[SCAN] ${scanType} error: ${e}`);
    return [];
  }
}

async function intelligentScan(owner: string, repo: string): Promise<Record<string, unknown>> {
  const files = await getRepoFiles(owner, repo);
  if (!files.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no files" };

  const codeBlocks: string[] = [];
  let charCount = 0;

  for (const path of files) {
    if (charCount >= 10000) break;
    const content = await getFileContent(owner, repo, path);
    if (content.length > 30) {
      const snippet = content.slice(0, 1500);
      charCount += snippet.length;
      codeBlocks.push(`\n=== ${path} ===\n${snippet}`);
    }
  }

  if (!codeBlocks.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no content" };

  const code = codeBlocks.join("\n").slice(0, 10000);
  const [security, bugs, quality] = await Promise.all([
    runScan("security", SECURITY_PROMPT, code),
    runScan("bugs", BUG_PROMPT, code),
    runScan("quality", QUALITY_PROMPT, code),
  ]);

  const findings = [
    ...security.map((f) => ({ ...f, type: "security" })),
    ...bugs.map((f) => ({ ...f, type: "bug" })),
    ...quality.map((f) => ({ ...f, type: "quality" })),
  ];

  const c = findings.filter((f) => f.severity === "critical").length;
  const h = findings.filter((f) => f.severity === "high").length;
  const m = findings.filter((f) => f.severity === "medium").length;
  const l = findings.filter((f) => f.severity === "low").length;

  const score = Math.max(0, Math.min(100, 100 - c * 25 - h * 15 - m * 5 - l * 2));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const threat = c > 0 ? "CRITICAL" : h > 0 ? "HIGH" : m > 0 ? "MEDIUM" : l > 0 ? "LOW" : "SAFE";

  return {
    repo: `${owner}/${repo}`, score, grade, threat_level: threat,
    summary: `Scanned ${codeBlocks.length} files. Found ${security.length} security, ${bugs.length} bugs, ${quality.length} quality issues.`,
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
    : (await supabase.from("repo_configs").select("full_name").eq("enabled", true).limit(5)).data;

  if (!repos?.length) return Response.json({ error: "No repos" }, { status: 400 });

  const results = [];
  for (const repo of repos) {
    if (Date.now() - start > 250000) break;
    const [owner, name] = repo.full_name.split("/");
    try {
      const result = await intelligentScan(owner, name);
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

  return Response.json({ repos_scanned: results.length, duration_s: ((Date.now() - start) / 1000).toFixed(1), results, llm: getLLMStatus() });
});
