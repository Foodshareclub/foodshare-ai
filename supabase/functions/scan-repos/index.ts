import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Groq from "https://esm.sh/groq-sdk@0.37.0";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEEP_SCAN_PROMPT = `You are a world-class security researcher and bug hunter with expertise in finding critical vulnerabilities. Your mission is to perform an EXHAUSTIVE security audit of this codebase.

## YOUR EXPERTISE INCLUDES:
- 15+ years of penetration testing experience
- CVE discoveries and bug bounty hunting
- OWASP Top 10, SANS Top 25, CWE database mastery
- Language-specific vulnerabilities (JS/TS, Python, Go, Rust, Java, Swift, Kotlin)

## SCAN METHODOLOGY (Apply ALL):

### PHASE 1: SECRETS & CREDENTIALS
- API keys, tokens, passwords in code or comments
- Private keys, certificates, connection strings
- AWS/GCP/Azure credentials
- JWT secrets, encryption keys
- .env patterns that might leak

### PHASE 2: INJECTION ATTACKS
- SQL injection (raw queries, string concatenation, ORM bypasses)
- NoSQL injection (MongoDB operators, query manipulation)
- Command injection (exec, spawn, system, shell commands)
- LDAP injection, XPath injection
- Template injection (SSTI)
- Header injection, log injection

### PHASE 3: XSS & CLIENT-SIDE
- Reflected XSS, Stored XSS, DOM XSS
- dangerouslySetInnerHTML, innerHTML, document.write
- eval(), Function(), setTimeout/setInterval with strings
- Prototype pollution
- postMessage vulnerabilities

### PHASE 4: AUTHENTICATION & AUTHORIZATION
- Missing authentication on sensitive endpoints
- Broken access control (IDOR, privilege escalation)
- Insecure session management
- Weak password policies
- JWT vulnerabilities (none algorithm, weak secrets)
- OAuth/OIDC misconfigurations

### PHASE 5: DATA EXPOSURE
- Sensitive data in logs, errors, responses
- PII exposure, GDPR violations
- Insecure data storage
- Missing encryption for sensitive data
- Information disclosure in error messages

### PHASE 6: SSRF & NETWORK
- Server-Side Request Forgery
- Unvalidated redirects
- DNS rebinding potential
- Internal service exposure

### PHASE 7: FILE & PATH SECURITY
- Path traversal (../, directory escape)
- Arbitrary file read/write
- Insecure file uploads
- Symlink attacks

### PHASE 8: CRYPTOGRAPHY
- Weak algorithms (MD5, SHA1 for security)
- Hardcoded IVs, predictable random
- Missing integrity checks
- Insecure key derivation

### PHASE 9: RACE CONDITIONS & LOGIC
- TOCTOU vulnerabilities
- Business logic flaws
- Integer overflow/underflow
- Null pointer dereferences
- Resource exhaustion

### PHASE 10: DEPENDENCY & SUPPLY CHAIN
- Known vulnerable dependencies
- Typosquatting packages
- Malicious postinstall scripts
- Outdated security patches

## SEVERITY CLASSIFICATION:
- CRITICAL (9-10): Remote code execution, auth bypass, data breach potential
- HIGH (7-8.9): Significant security impact, exploitable vulnerabilities
- MEDIUM (4-6.9): Limited impact, requires specific conditions
- LOW (1-3.9): Minor issues, defense in depth

## OUTPUT FORMAT (STRICT JSON):
{
  "scan_id": "<uuid>",
  "security_score": <0-100, be HARSH>,
  "grade": "<A/B/C/D/F>",
  "threat_level": "<CRITICAL|HIGH|MEDIUM|LOW|SAFE>",
  "executive_summary": "<2-3 sentence overview for executives>",
  "findings": [
    {
      "id": "<F001>",
      "severity": "<critical|high|medium|low>",
      "cvss": <0.0-10.0>,
      "cwe": "<CWE-XXX>",
      "owasp": "<A01-A10 or N/A>",
      "category": "<category name>",
      "title": "<short descriptive title>",
      "file": "<exact file path>",
      "line_start": <number>,
      "line_end": <number>,
      "vulnerable_code": "<the exact vulnerable code>",
      "description": "<detailed technical explanation>",
      "impact": "<what an attacker could achieve>",
      "exploitation": "<how to exploit this>",
      "remediation": "<specific fix with code example>",
      "references": ["<relevant CVE, CWE, or documentation URLs>"]
    }
  ],
  "statistics": {
    "files_analyzed": <number>,
    "lines_of_code": <approximate>,
    "critical_count": <number>,
    "high_count": <number>,
    "medium_count": <number>,
    "low_count": <number>
  },
  "recommendations": [
    "<prioritized security improvement>"
  ],
  "positive_findings": [
    "<good security practices observed>"
  ]
}

## CRITICAL RULES:
1. Be THOROUGH - scan every line, every function, every import
2. Be ACCURATE - no false positives, only real vulnerabilities
3. Be SPECIFIC - exact file paths, line numbers, code snippets
4. Be ACTIONABLE - provide working fixes, not vague suggestions
5. Think like an ATTACKER - how would you exploit this?

Return ONLY valid JSON. No markdown, no explanations outside JSON.`;

async function ghFetch(endpoint: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "FoodShare-DeepScan/2.0",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  
  const res = await fetch(`https://api.github.com${endpoint}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

async function getRepoStructure(owner: string, repo: string): Promise<{ files: string[], totalSize: number }> {
  for (const branch of ["main", "master", "develop"]) {
    try {
      const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      const codeFiles = (tree.tree || [])
        .filter((f: any) => f.type === "blob" && f.size && f.size < 100000)
        .filter((f: any) => /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|cs|vue|svelte)$/i.test(f.path))
        .filter((f: any) => !/(node_modules|vendor|dist|build|\.min\.|\.bundle\.|__pycache__|\.git|coverage|\.next)/i.test(f.path));
      
      const totalSize = codeFiles.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
      return { 
        files: codeFiles.map((f: any) => f.path).slice(0, 60),
        totalSize 
      };
    } catch { continue; }
  }
  return { files: [], totalSize: 0 };
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

async function getPackageInfo(owner: string, repo: string): Promise<string> {
  // Try to get dependency info
  const depFiles = ["package.json", "requirements.txt", "go.mod", "Cargo.toml", "build.gradle", "pom.xml"];
  for (const depFile of depFiles) {
    const content = await getFileContent(owner, repo, depFile);
    if (content) return `### DEPENDENCIES (${depFile}):\n${content.slice(0, 3000)}`;
  }
  return "";
}

async function deepScanRepo(owner: string, repo: string, groq: any): Promise<any> {
  console.log(`[DEEP SCAN] Starting ${owner}/${repo}`);
  
  const { files, totalSize } = await getRepoStructure(owner, repo);
  if (!files.length) {
    return { repo: `${owner}/${repo}`, skipped: true, reason: "no scannable code files" };
  }

  console.log(`[DEEP SCAN] Found ${files.length} files (${(totalSize/1024).toFixed(1)}KB)`);

  // Prioritize security-critical files
  const priorityPatterns = [
    /auth/i, /login/i, /session/i, /token/i, /password/i, /secret/i,
    /api/i, /route/i, /endpoint/i, /handler/i, /controller/i,
    /database/i, /query/i, /sql/i, /model/i,
    /upload/i, /file/i, /download/i,
    /payment/i, /billing/i, /stripe/i,
    /admin/i, /user/i, /permission/i, /role/i,
    /crypto/i, /encrypt/i, /hash/i,
    /config/i, /env/i, /setting/i
  ];

  const prioritizedFiles = [
    ...files.filter(f => priorityPatterns.some(p => p.test(f))),
    ...files.filter(f => !priorityPatterns.some(p => p.test(f)))
  ].slice(0, 40);

  // Fetch file contents - limit size for API
  const codeBlocks: string[] = [];
  let totalLines = 0;
  let totalChars = 0;
  const MAX_CHARS = 15000; // Keep under token limit
  
  for (const path of prioritizedFiles) {
    if (totalChars > MAX_CHARS) break;
    
    const content = await getFileContent(owner, repo, path);
    if (content && content.length > 20) {
      const lines = content.split('\n');
      totalLines += lines.length;
      const snippet = content.slice(0, 2000); // Limit per file
      totalChars += snippet.length;
      codeBlocks.push(`\n### ${path}\n\`\`\`\n${snippet}\n\`\`\``);
    }
  }

  if (!codeBlocks.length) {
    return { repo: `${owner}/${repo}`, skipped: true, reason: "could not read files" };
  }

  // Get dependency info
  const depInfo = await getPackageInfo(owner, repo);

  console.log(`[DEEP SCAN] Analyzing ${codeBlocks.length} files, ~${totalLines} lines`);

  // Deep scan with LLM
  const scanPrompt = `You are a security auditor. Find vulnerabilities in this code.

SCAN FOR: SQL injection, XSS, command injection, hardcoded secrets, auth flaws, path traversal, SSRF, insecure crypto.

RESPOND WITH JSON ONLY:
{"security_score":<0-100>,"grade":"<A-F>","threat_level":"<CRITICAL|HIGH|MEDIUM|LOW|SAFE>","executive_summary":"<summary>","findings":[{"severity":"<critical|high|medium|low>","cwe":"<CWE-XXX>","title":"<title>","file":"<path>","line":<num>,"code":"<snippet>","description":"<desc>","fix":"<fix>"}],"statistics":{"critical_count":<n>,"high_count":<n>,"medium_count":<n>,"low_count":<n>}}

REPO: ${owner}/${repo}
CODE:
${codeBlocks.join('\n').slice(0, 12000)}`;

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      { role: "system", content: "Security auditor. Return only valid JSON." },
      { role: "user", content: scanPrompt }
    ],
    temperature: 0.1,
    max_tokens: 2048,
  });

  let result;
  try {
    let json = response.choices[0]?.message?.content || "{}";
    // Clean up any markdown
    json = json.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    result = JSON.parse(json);
  } catch (e) {
    console.error(`[DEEP SCAN] Parse error: ${e}`);
    result = { 
      security_score: 50, 
      grade: "C",
      threat_level: "MEDIUM",
      executive_summary: "Scan completed but results could not be parsed",
      findings: [],
      statistics: { files_analyzed: codeBlocks.length, lines_of_code: totalLines }
    };
  }

  // Enrich result
  result.scan_metadata = {
    repo: `${owner}/${repo}`,
    files_scanned: codeBlocks.length,
    total_lines: totalLines,
    scan_time: new Date().toISOString(),
  };

  return {
    repo: `${owner}/${repo}`,
    score: result.security_score,
    grade: result.grade,
    threat_level: result.threat_level,
    summary: result.executive_summary,
    findings_count: result.findings?.length || 0,
    critical: result.statistics?.critical_count || result.findings?.filter((f: any) => f.severity === "critical").length || 0,
    high: result.statistics?.high_count || result.findings?.filter((f: any) => f.severity === "high").length || 0,
    medium: result.statistics?.medium_count || result.findings?.filter((f: any) => f.severity === "medium").length || 0,
    low: result.statistics?.low_count || result.findings?.filter((f: any) => f.severity === "low").length || 0,
    files_analyzed: codeBlocks.length,
    lines_analyzed: totalLines,
    details: result,
  };
}

serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const url = new URL(req.url);
    const testRepo = url.searchParams.get("repo");
    const deep = url.searchParams.get("deep") !== "false"; // Deep scan by default
    
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
        .limit(3); // Limit for deep scans
      repos = data;
    }

    if (!repos?.length) {
      return Response.json({ error: "No repos configured" }, { status: 400 });
    }

    const results = [];
    for (const repo of repos) {
      if (Date.now() - startTime > 270000) { // 4.5 min timeout
        results.push({ repo: repo.full_name, skipped: true, reason: "timeout" });
        continue;
      }
      
      const [owner, name] = repo.full_name.split("/");
      try {
        const result = await deepScanRepo(owner, name, groq);
        results.push(result);
        
        // Save comprehensive results
        if (!result.skipped && result.details) {
          await supabase.from("security_scans").insert({
            repo_full_name: repo.full_name,
            security_score: result.score,
            issues: result.details.findings || [],
            summary: result.summary,
            files_scanned: result.files_analyzed,
            scan_metadata: {
              grade: result.grade,
              threat_level: result.threat_level,
              statistics: result.details.statistics,
              recommendations: result.details.recommendations,
              positive_findings: result.details.positive_findings,
            }
          });
        }
      } catch (e) {
        console.error(`[DEEP SCAN] Error scanning ${repo.full_name}: ${e}`);
        results.push({ repo: repo.full_name, error: String(e).slice(0, 200) });
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    return Response.json({ 
      scan_type: "deep",
      repos_scanned: results.length,
      duration_seconds: parseFloat(duration),
      timestamp: new Date().toISOString(),
      results 
    });
  } catch (e) {
    console.error(`[DEEP SCAN] Fatal error: ${e}`);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
