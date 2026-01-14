import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Groq from "https://esm.sh/groq-sdk@0.37.0";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SECURITY_PROMPT = `You are a STRICT security auditor. Find ALL vulnerabilities, even minor ones.

MUST REPORT:
- Any env var access without validation → MEDIUM
- Any user input used without sanitization → HIGH  
- Any SQL/query with string interpolation → CRITICAL
- Any hardcoded URLs, IDs, or config values → LOW
- Missing auth checks on routes → HIGH
- eval(), Function(), innerHTML, dangerouslySetInnerHTML → HIGH
- Any try/catch that swallows errors silently → MEDIUM
- Missing rate limiting on APIs → MEDIUM
- Secrets in code (even if env vars) → check if exposed
- CORS with * or overly permissive → MEDIUM

Be AGGRESSIVE. Report anything suspicious. Better false positives than missed vulnerabilities.`;

const BUG_PROMPT = `You are a STRICT bug hunter. Find ALL potential bugs and logic errors.

MUST REPORT:
- Any optional chaining that could be added → LOW
- Missing null/undefined checks → MEDIUM
- Async functions without try/catch → MEDIUM
- Array access without bounds check → MEDIUM
- Type assertions (as any, as Type) → LOW
- Missing await on async calls → HIGH
- Promises without .catch() → MEDIUM
- Potential race conditions → HIGH
- State mutations that could cause issues → MEDIUM
- Off-by-one potential in loops → MEDIUM

Be AGGRESSIVE. Report anything that COULD cause a bug in production.`;

const QUALITY_PROMPT = `You are a STRICT code reviewer. Find ALL quality issues.

MUST REPORT:
- Functions over 30 lines → LOW
- More than 3 levels of nesting → LOW
- Magic numbers/strings → LOW
- Repeated code patterns → MEDIUM
- Unclear variable names → LOW
- Missing error messages → LOW
- Console.log left in code → LOW
- TODO/FIXME comments → LOW
- Commented out code → LOW
- Missing TypeScript types → LOW

Be AGGRESSIVE. Report anything that hurts maintainability.`;

async function ghFetch(endpoint: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "FoodShare-DeepScan/3.0",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

async function getRepoFiles(owner: string, repo: string): Promise<string[]> {
  for (const branch of ["main", "master", "develop"]) {
    try {
      const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      return (tree.tree || [])
        .filter((f: any) => f.type === "blob" && f.size > 50 && f.size < 80000)
        .filter((f: any) => /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|vue|svelte)$/i.test(f.path))
        .filter((f: any) => !/(node_modules|vendor|dist|build|\.min\.|test|spec|__pycache__|\.next|coverage)/i.test(f.path))
        .sort((a: any, b: any) => {
          const priority = (p: string) => {
            if (/auth|login|session|token|password|secret|key/i.test(p)) return 0;
            if (/api|route|endpoint|handler|controller/i.test(p)) return 1;
            if (/database|query|sql|model|schema/i.test(p)) return 2;
            if (/payment|billing|stripe|checkout/i.test(p)) return 3;
            if (/config|env|setting/i.test(p)) return 5;
            return 10;
          };
          return priority(a.path) - priority(b.path);
        })
        .map((f: any) => f.path)
        .slice(0, 40);
    } catch { continue; }
  }
  return [];
}

async function getFileContent(owner: string, repo: string, path: string): Promise<string> {
  try {
    const file = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`);
    if (file.encoding === "base64" && file.content) {
      return atob(file.content.replace(/\n/g, ""));
    }
  } catch {}
  return "";
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runScan(groq: any, scanType: string, prompt: string, code: string, retries = 2): Promise<any[]> {
  for (let i = 0; i <= retries; i++) {
    try {
      if (i > 0) await sleep(2000 * i); // Backoff
      
      const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: prompt },
          { 
            role: "user", 
            content: `Analyze this code. Return JSON array of findings.
FORMAT: [{"severity":"critical|high|medium|low","category":"<type>","title":"<issue>","file":"<path>","line":<num>,"code":"<snippet>","problem":"<why>","fix":"<how>"}]
Return [] only if perfect. Report ALL issues.

${code}` 
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      let json = response.choices[0]?.message?.content || "[]";
      json = json.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      const start = json.indexOf("[");
      const end = json.lastIndexOf("]") + 1;
      if (start >= 0 && end > start) json = json.slice(start, end);
      return JSON.parse(json);
    } catch (e: any) {
      if (e.status === 429 && i < retries) {
        console.log(`[SCAN] Rate limited on ${scanType}, retry ${i + 1}`);
        continue;
      }
      console.error(`[SCAN] ${scanType} error: ${e}`);
      return [];
    }
  }
  return [];
}

async function intelligentScan(owner: string, repo: string, groq: any): Promise<any> {
  console.log(`[SCAN] ${owner}/${repo}`);
  
  const files = await getRepoFiles(owner, repo);
  if (!files.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no files" };

  const codeBlocks: string[] = [];
  let totalLines = 0;
  let charCount = 0;

  for (const path of files) {
    if (charCount >= 12000) break;
    const content = await getFileContent(owner, repo, path);
    if (content && content.length > 30) {
      totalLines += content.split('\n').length;
      const snippet = content.slice(0, 2000);
      charCount += snippet.length;
      codeBlocks.push(`\n=== ${path} ===\n${snippet}`);
    }
  }

  if (!codeBlocks.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no content" };

  const code = codeBlocks.join('\n').slice(0, 12000);
  console.log(`[SCAN] ${codeBlocks.length} files, ~${totalLines} lines`);

  // Sequential scans with delays to avoid rate limits
  const security = await runScan(groq, "security", SECURITY_PROMPT, code);
  await sleep(1500);
  const bugs = await runScan(groq, "bugs", BUG_PROMPT, code);
  await sleep(1500);
  const quality = await runScan(groq, "quality", QUALITY_PROMPT, code);

  const findings = [
    ...security.map((f: any) => ({ ...f, type: "security" })),
    ...bugs.map((f: any) => ({ ...f, type: "bug" })),
    ...quality.map((f: any) => ({ ...f, type: "quality" })),
  ];

  // Score
  const c = findings.filter((f: any) => f.severity === "critical").length;
  const h = findings.filter((f: any) => f.severity === "high").length;
  const m = findings.filter((f: any) => f.severity === "medium").length;
  const l = findings.filter((f: any) => f.severity === "low").length;

  let score = Math.max(0, Math.min(100, 100 - c * 25 - h * 15 - m * 5 - l * 2));
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const threat = c > 0 ? "CRITICAL" : h > 0 ? "HIGH" : m > 0 ? "MEDIUM" : l > 0 ? "LOW" : "SAFE";

  const summary = findings.length === 0
    ? `Scanned ${codeBlocks.length} files. No issues found.`
    : `Scanned ${codeBlocks.length} files. Found ${security.length} security, ${bugs.length} bugs, ${quality.length} quality issues.${c > 0 ? ` ⚠️ ${c} CRITICAL!` : ""}`;

  return {
    repo: `${owner}/${repo}`,
    score, grade, threat_level: threat, summary,
    total: findings.length,
    by_type: { security: security.length, bugs: bugs.length, quality: quality.length },
    by_severity: { critical: c, high: h, medium: m, low: l },
    files_analyzed: codeBlocks.length,
    lines_analyzed: totalLines,
    findings,
  };
}

serve(async (req) => {
  const start = Date.now();
  
  try {
    const url = new URL(req.url);
    const testRepo = url.searchParams.get("repo");
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const groq = new Groq({ apiKey: GROQ_API_KEY });

    let repos;
    if (testRepo) {
      repos = [{ full_name: testRepo }];
    } else {
      const { data } = await supabase.from("repo_configs").select("full_name").eq("enabled", true).limit(5);
      repos = data;
    }

    if (!repos?.length) return Response.json({ error: "No repos" }, { status: 400 });

    const results = [];
    for (const repo of repos) {
      if (Date.now() - start > 250000) {
        results.push({ repo: repo.full_name, skipped: true, reason: "timeout" });
        continue;
      }
      
      const [owner, name] = repo.full_name.split("/");
      try {
        const result = await intelligentScan(owner, name, groq);
        results.push(result);
        
        if (!result.skipped) {
          await supabase.from("security_scans").insert({
            repo_full_name: repo.full_name,
            security_score: result.score,
            issues: result.findings,
            summary: result.summary,
            files_scanned: result.files_analyzed,
            scan_metadata: {
              grade: result.grade,
              threat_level: result.threat_level,
              by_type: result.by_type,
              by_severity: result.by_severity,
            }
          });
        }
      } catch (e) {
        results.push({ repo: repo.full_name, error: String(e).slice(0, 100) });
      }
    }

    return Response.json({ 
      scan_type: "intelligent-multipass-v3",
      repos_scanned: results.length,
      duration_seconds: ((Date.now() - start) / 1000).toFixed(1),
      results: results.map(r => ({
        repo: r.repo, score: r.score, grade: r.grade, threat_level: r.threat_level,
        summary: r.summary, by_type: r.by_type, by_severity: r.by_severity,
        ...(r.skipped && { skipped: true, reason: r.reason }),
        ...(r.error && { error: r.error }),
      })),
      detailed_findings: results.filter(r => r.findings).map(r => ({ repo: r.repo, findings: r.findings })),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
