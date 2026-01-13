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
}

const SENSITIVE_PATTERNS = [
  /auth/i, /login/i, /password/i, /secret/i, /token/i, /api.?key/i,
  /payment/i, /billing/i, /stripe/i, /security/i, /encrypt/i,
  /middleware/i, /migration/i, /schema/i, /admin/i, /permission/i,
];

export function analyzePR(ctx: PRContext): ReviewDecision {
  const reasons: string[] = [];
  const focus_areas: string[] = [];
  let score = 0;
  const totalChanges = ctx.additions + ctx.deletions;
  const titleLower = ctx.title.toLowerCase();

  // Size
  if (totalChanges > 500) { score += 3; reasons.push(`Large: ${totalChanges} lines`); }
  else if (totalChanges > 200) { score += 2; reasons.push(`Medium: ${totalChanges} lines`); }
  if (ctx.files_changed > 20) { score += 2; reasons.push(`${ctx.files_changed} files`); }

  // Title keywords
  if (SENSITIVE_PATTERNS.some(p => p.test(ctx.title))) {
    score += 3; reasons.push("Sensitive title"); focus_areas.push("security");
  }
  if (titleLower.includes("security") || titleLower.includes("vulnerability")) {
    score += 4; reasons.push("Security fix"); focus_areas.push("security");
  }
  if (titleLower.includes("fix") || titleLower.includes("bug")) {
    score += 1; reasons.push("Bug fix"); focus_areas.push("bug");
  }
  if (titleLower.includes("perf")) {
    focus_areas.push("performance");
  }

  // Sensitive files
  const sensitiveFiles = ctx.files.filter(f => SENSITIVE_PATTERNS.some(p => p.test(f)));
  if (sensitiveFiles.length) {
    score += 2; reasons.push(`Sensitive: ${sensitiveFiles.slice(0, 2).join(", ")}`);
    focus_areas.push("security");
  }

  // API changes
  if (ctx.files.some(f => /route|api\//i.test(f))) {
    score += 1; reasons.push("API changes"); focus_areas.push("security", "bug");
  }

  // Production branch
  if (["main", "master", "production"].includes(ctx.base_branch)) {
    score += 1;
  }

  // Skip labels
  if (ctx.labels.some(l => /skip.?review|no.?review/i.test(l))) {
    return { should_review: false, depth: "quick", priority: "low", reasons: ["skip-review label"], focus_areas: [] };
  }

  const depth = score >= 6 ? "deep" : score >= 3 ? "standard" : "quick";
  const priority = score >= 7 ? "critical" : score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  const should_review = score >= 1 || totalChanges > 30;

  return {
    should_review,
    depth,
    priority,
    reasons: reasons.length ? reasons : ["Standard changes"],
    focus_areas: [...new Set(focus_areas)],
  };
}
