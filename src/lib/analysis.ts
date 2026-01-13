// Shared PR risk analysis logic

export interface PRContext {
  files_changed: number;
  additions: number;
  deletions: number;
  title: string;
  labels: string[];
  base_branch: string;
  files: string[];
}

export interface ReviewDecision {
  should_review: boolean;
  depth: "quick" | "standard" | "deep";
  priority: "low" | "medium" | "high" | "critical";
  reasons: string[];
  focus_areas: string[];
  estimated_time: string;
  score: number;
}

const SENSITIVE_PATTERNS = [
  { pattern: /auth/i, weight: 3, area: "security" },
  { pattern: /login|password|credential/i, weight: 3, area: "security" },
  { pattern: /secret|token|api.?key/i, weight: 4, area: "security" },
  { pattern: /payment|billing|stripe|checkout/i, weight: 4, area: "security" },
  { pattern: /encrypt|decrypt|crypto|hash/i, weight: 3, area: "security" },
  { pattern: /middleware/i, weight: 2, area: "security" },
  { pattern: /migration|schema/i, weight: 2, area: "bug" },
  { pattern: /admin|permission|role|acl/i, weight: 3, area: "security" },
  { pattern: /sql|query|database/i, weight: 2, area: "security" },
  { pattern: /route|api\//i, weight: 1, area: "bug" },
  { pattern: /\.env|config/i, weight: 2, area: "security" },
];

export function analyzePR(ctx: PRContext): ReviewDecision {
  const reasons: string[] = [];
  const focus_set = new Set<string>();
  let score = 0;
  const totalChanges = ctx.additions + ctx.deletions;
  const titleLower = ctx.title.toLowerCase();

  // Size analysis
  if (totalChanges > 1000) {
    score += 4; reasons.push(`Very large: ${totalChanges} lines`);
  } else if (totalChanges > 500) {
    score += 3; reasons.push(`Large: ${totalChanges} lines`);
  } else if (totalChanges > 200) {
    score += 2; reasons.push(`Medium: ${totalChanges} lines`);
  } else if (totalChanges < 20) {
    score -= 1; // Small PRs are lower risk
  }

  if (ctx.files_changed > 30) {
    score += 3; reasons.push(`Many files: ${ctx.files_changed}`);
  } else if (ctx.files_changed > 15) {
    score += 2; reasons.push(`${ctx.files_changed} files`);
  }

  // Title analysis
  for (const { pattern, weight, area } of SENSITIVE_PATTERNS) {
    if (pattern.test(ctx.title)) {
      score += weight;
      focus_set.add(area);
      if (!reasons.includes("Sensitive title")) reasons.push("Sensitive title");
      break; // Only count title once
    }
  }

  // Specific title keywords
  if (/security|vulnerab|cve-/i.test(titleLower)) {
    score += 4; reasons.push("Security fix"); focus_set.add("security");
  }
  if (/fix|bug|issue|crash|error/i.test(titleLower)) {
    score += 1; reasons.push("Bug fix"); focus_set.add("bug");
  }
  if (/perf|optim|speed|slow/i.test(titleLower)) {
    score += 1; focus_set.add("performance");
  }
  if (/refactor|cleanup|reorgan/i.test(titleLower)) {
    score += 1; reasons.push("Refactor");
  }
  if (/breaking|major/i.test(titleLower)) {
    score += 2; reasons.push("Breaking change");
  }

  // File analysis
  const matchedFiles: string[] = [];
  for (const file of ctx.files) {
    for (const { pattern, weight, area } of SENSITIVE_PATTERNS) {
      if (pattern.test(file)) {
        score += Math.ceil(weight / 2); // Half weight for files vs title
        focus_set.add(area);
        if (matchedFiles.length < 3) matchedFiles.push(file.split("/").pop() || file);
        break;
      }
    }
  }
  if (matchedFiles.length) {
    reasons.push(`Sensitive: ${matchedFiles.join(", ")}`);
  }

  // Test file changes (lower risk if only tests)
  const testFiles = ctx.files.filter(f => /test|spec|__tests__/i.test(f));
  if (testFiles.length === ctx.files.length && ctx.files.length > 0) {
    score -= 2; reasons.push("Tests only");
  }

  // Docs only (very low risk)
  const docFiles = ctx.files.filter(f => /\.md$|docs\//i.test(f));
  if (docFiles.length === ctx.files.length && ctx.files.length > 0) {
    score -= 3; reasons.push("Docs only");
  }

  // Production branch
  if (["main", "master", "production", "release"].includes(ctx.base_branch)) {
    score += 1;
  }

  // Label analysis
  if (ctx.labels.some(l => /security|critical|urgent|hotfix/i.test(l))) {
    score += 2; reasons.push("Priority label"); focus_set.add("security");
  }
  if (ctx.labels.some(l => /skip.?review|no.?review|bot/i.test(l))) {
    return {
      should_review: false, depth: "quick", priority: "low",
      reasons: ["skip-review label"], focus_areas: [], estimated_time: "0s", score: 0,
    };
  }
  if (ctx.labels.some(l => /wip|draft|do.?not.?merge/i.test(l))) {
    score -= 2; reasons.push("WIP/Draft");
  }

  // Ensure score doesn't go negative for should_review calc
  const effectiveScore = Math.max(0, score);

  const depth = effectiveScore >= 7 ? "deep" : effectiveScore >= 3 ? "standard" : "quick";
  const priority = effectiveScore >= 8 ? "critical" : effectiveScore >= 5 ? "high" : effectiveScore >= 2 ? "medium" : "low";
  const should_review = effectiveScore >= 1 || totalChanges > 30;

  // Estimate time based on depth and size
  const baseTime = depth === "deep" ? 15 : depth === "standard" ? 8 : 4;
  const sizeMultiplier = Math.min(3, 1 + totalChanges / 500);
  const estimated_time = `~${Math.round(baseTime * sizeMultiplier)}s`;

  return {
    should_review,
    depth,
    priority,
    reasons: reasons.length ? reasons : ["Standard changes"],
    focus_areas: [...focus_set],
    estimated_time,
    score: effectiveScore,
  };
}

// Build depth-specific prompt additions
export function getDepthPrompt(depth: "quick" | "standard" | "deep", focus_areas: string[]): string {
  const parts: string[] = [];

  if (depth === "quick") {
    parts.push(`## Review Mode: QUICK
- Focus ONLY on critical/high severity issues
- Skip minor style issues and nitpicks
- Be concise - max 3 line comments
- Only flag issues that could cause bugs, security issues, or crashes`);
  } else if (depth === "deep") {
    parts.push(`## Review Mode: DEEP
- Be thorough and comprehensive
- Check edge cases, error handling, race conditions
- Look for subtle bugs and security issues
- Review error messages and logging
- Check for proper cleanup and resource management
- Verify input validation at all boundaries
- Consider backwards compatibility`);
  }

  if (focus_areas.length) {
    const focusMap: Record<string, string> = {
      security: "SECURITY: SQL injection, XSS, auth bypass, secrets, input validation",
      bug: "BUGS: Logic errors, null handling, edge cases, type issues",
      performance: "PERFORMANCE: N+1 queries, memory leaks, blocking calls, caching",
    };
    const focuses = focus_areas.map(a => focusMap[a]).filter(Boolean);
    if (focuses.length) {
      parts.push(`\n## Priority Focus\n${focuses.join("\n")}`);
    }
  }

  return parts.join("\n");
}
