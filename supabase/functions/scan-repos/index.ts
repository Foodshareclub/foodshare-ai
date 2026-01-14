import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Groq from "https://esm.sh/groq-sdk@0.37.0";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SCAN_PROMPT = `You are an elite security auditor scanning a codebase for vulnerabilities.

## CRITICAL CHECKS:
1. Hardcoded secrets (API keys, passwords, tokens, private keys)
2. SQL/NoSQL injection vulnerabilities
3. XSS (Cross-Site Scripting)
4. Command injection (exec, spawn, system calls)
5. Path traversal (../ in file paths)
6. Insecure authentication/authorization
7. Sensitive data exposure
8. SSRF vulnerabilities
9. Insecure deserialization
10. Using components with known vulnerabilities

## RESPONSE FORMAT (strict JSON):
{
  "security_score": <0-100>,
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "type": "HARDCODED_SECRET|SQL_INJECTION|XSS|COMMAND_INJECTION|PATH_TRAVERSAL|AUTH_FLAW|DATA_EXPOSURE|SSRF|INSECURE_DESER|VULNERABLE_DEP",
      "file": "path/to/file.ts",
      "line": 42,
      "code": "the vulnerable code snippet",
      "description": "what's wrong and why it's dangerous",
      "fix": "the corrected code"
    }
  ],
  "summary": "brief overall assessment"
}

Be thorough but only report REAL issues. No false positives. Return ONLY valid JSON.`;

async function ghFetch(endpoint: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "FoodShare-Security-Scanner",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

async function getRepoFiles(owner: string, repo: string): Promise<string[]> {
  for (const branch of ["main", "master"]) {
    try {
      const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      return (tree.tree || [])
        .filter((f: any) => f.type === "blob" && f.size && f.size < 50000)
        .map((f: any) => f.path)
        .filter((p: string) => /\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift|rb|php|cs)$/i.test(p))
        .filter((p: string) => !/(node_modules|vendor|dist|build|\.min\.|test|spec|mock)/i.test(p))
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

async function scanRepo(owner: string, repo: string, groq: any) {
  const files = await getRepoFiles(owner, repo);
  if (!files.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no scannable files" };

  // Fetch contents
  const contents: string[] = [];
  for (const path of files.slice(0, 25)) {
    const content = await getFileContent(owner, repo, path);
    if (content && content.length > 50 && content.length < 8000) {
      contents.push(`### FILE: ${path}\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``);
    }
  }

  if (!contents.length) return { repo: `${owner}/${repo}`, skipped: true, reason: "no readable files" };

  // Scan with LLM
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: "You are a security auditor. Return only valid JSON, no markdown." },
      { role: "user", content: `${SCAN_PROMPT}\n\n## CODEBASE TO SCAN:\n${contents.join("\n\n").slice(0, 28000)}` }
    ],
    temperature: 0.1,
    max_tokens: 4096,
  });

  let result;
  try {
    let json = response.choices[0]?.message?.content || "{}";
    if (json.includes("```")) json = json.replace(/```json?\n?/g, "").replace(/```/g, "");
    result = JSON.parse(json.trim());
  } catch {
    result = { security_score: 100, issues: [], summary: "Parse error" };
  }

  return {
    repo: `${owner}/${repo}`,
    score: result.security_score,
    issues: result.issues?.length || 0,
    critical: result.issues?.filter((i: any) => i.severity === "critical").length || 0,
    high: result.issues?.filter((i: any) => i.severity === "high").length || 0,
    summary: result.summary,
    details: result,
  };
}

serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const url = new URL(req.url);
    const testRepo = url.searchParams.get("repo"); // Optional: test single repo
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const groq = new Groq({ apiKey: GROQ_API_KEY });

    let repos;
    if (testRepo) {
      repos = [{ full_name: testRepo }];
    } else {
      const { data } = await supabase
        .from("repo_configs")
        .select("full_name")
        .eq("enabled", true)
        .limit(5); // Limit to 5 repos per run
      repos = data;
    }

    if (!repos?.length) {
      return Response.json({ message: "No repos configured" });
    }

    const results = [];
    for (const repo of repos) {
      // Check timeout (4 min max)
      if (Date.now() - startTime > 240000) {
        results.push({ repo: repo.full_name, skipped: true, reason: "timeout" });
        continue;
      }
      
      const [owner, name] = repo.full_name.split("/");
      try {
        console.log(`Scanning ${owner}/${name}...`);
        const result = await scanRepo(owner, name, groq);
        console.log(`Result: ${JSON.stringify(result).slice(0, 200)}`);
        results.push(result);
        
        // Save to DB if scan completed
        if (!result.skipped) {
          await supabase.from("security_scans").insert({
            repo_full_name: repo.full_name,
            security_score: result.score,
            issues: result.details?.issues || [],
            summary: result.summary,
            files_scanned: result.details?.issues?.length || 0,
          });
        }
      } catch (e) {
        results.push({ repo: repo.full_name, error: String(e).slice(0, 100) });
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    return Response.json({ 
      scanned: results.length, 
      duration: `${duration}s`,
      results 
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
