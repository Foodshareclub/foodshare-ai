import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

interface PRContext {
  files_changed: number;
  additions: number;
  deletions: number;
  title: string;
  labels: string[];
  author: string;
  base_branch: string;
  file_types: string[];
}

interface ReviewDecision {
  should_review: boolean;
  review_depth: "quick" | "standard" | "deep";
  priority: "low" | "medium" | "high" | "critical";
  reasons: string[];
  categories: string[];
}

// Patterns that indicate high-risk changes
const HIGH_RISK_PATTERNS = [
  /auth/i, /login/i, /password/i, /secret/i, /token/i, /api.?key/i,
  /payment/i, /billing/i, /credit/i, /stripe/i,
  /database/i, /migration/i, /schema/i,
  /security/i, /encrypt/i, /decrypt/i,
  /admin/i, /permission/i, /role/i,
];

const SENSITIVE_FILE_PATTERNS = [
  /\.env/, /config/, /secret/, /credential/,
  /middleware/, /auth/, /api\/.*route/,
  /migration/, /schema/, /model/,
];

function analyzeRisk(ctx: PRContext): ReviewDecision {
  const reasons: string[] = [];
  const categories: string[] = ["security", "bug", "performance", "best_practices"];
  let riskScore = 0;

  // Size-based analysis
  const totalChanges = ctx.additions + ctx.deletions;
  if (totalChanges > 500) {
    riskScore += 3;
    reasons.push(`Large PR: ${totalChanges} lines changed`);
  } else if (totalChanges > 200) {
    riskScore += 2;
    reasons.push(`Medium PR: ${totalChanges} lines changed`);
  }

  if (ctx.files_changed > 20) {
    riskScore += 2;
    reasons.push(`Many files: ${ctx.files_changed} files changed`);
  }

  // Title analysis
  const titleLower = ctx.title.toLowerCase();
  if (HIGH_RISK_PATTERNS.some(p => p.test(ctx.title))) {
    riskScore += 3;
    reasons.push("Title indicates sensitive changes");
  }
  if (titleLower.includes("fix") || titleLower.includes("bug")) {
    riskScore += 1;
    reasons.push("Bug fix - verify correctness");
  }
  if (titleLower.includes("refactor")) {
    riskScore += 1;
    reasons.push("Refactor - check for regressions");
  }
  if (titleLower.includes("security") || titleLower.includes("vulnerability")) {
    riskScore += 4;
    reasons.push("Security-related changes");
  }

  // File type analysis
  const sensitiveFiles = ctx.file_types.filter(f => 
    SENSITIVE_FILE_PATTERNS.some(p => p.test(f))
  );
  if (sensitiveFiles.length > 0) {
    riskScore += 2;
    reasons.push(`Sensitive files: ${sensitiveFiles.slice(0, 3).join(", ")}`);
  }

  // Check for specific file types
  if (ctx.file_types.some(f => f.includes("route") || f.includes("api"))) {
    riskScore += 1;
    reasons.push("API changes detected");
  }
  if (ctx.file_types.some(f => f.includes("middleware"))) {
    riskScore += 2;
    reasons.push("Middleware changes");
  }

  // Branch analysis
  if (ctx.base_branch === "main" || ctx.base_branch === "master" || ctx.base_branch === "production") {
    riskScore += 1;
    reasons.push("Merging to production branch");
  }

  // Label analysis
  if (ctx.labels.some(l => /security|critical|urgent/i.test(l))) {
    riskScore += 2;
    reasons.push("High-priority labels");
  }
  if (ctx.labels.some(l => /skip.?review|no.?review/i.test(l))) {
    return {
      should_review: false,
      review_depth: "quick",
      priority: "low",
      reasons: ["Skipped: no-review label"],
      categories: [],
    };
  }

  // Determine review depth and priority
  let review_depth: "quick" | "standard" | "deep";
  let priority: "low" | "medium" | "high" | "critical";

  if (riskScore >= 8) {
    review_depth = "deep";
    priority = "critical";
  } else if (riskScore >= 5) {
    review_depth = "deep";
    priority = "high";
  } else if (riskScore >= 3) {
    review_depth = "standard";
    priority = "medium";
  } else {
    review_depth = "quick";
    priority = "low";
  }

  // Skip very small, low-risk PRs
  const should_review = riskScore >= 1 || totalChanges > 50;

  return {
    should_review,
    review_depth,
    priority,
    reasons: reasons.length > 0 ? reasons : ["Standard code changes"],
    categories,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Extract PR context from webhook payload or direct call
    const ctx: PRContext = {
      files_changed: body.pull_request?.changed_files || body.files_changed || 0,
      additions: body.pull_request?.additions || body.additions || 0,
      deletions: body.pull_request?.deletions || body.deletions || 0,
      title: body.pull_request?.title || body.title || "",
      labels: (body.pull_request?.labels || body.labels || []).map((l: any) => l.name || l),
      author: body.pull_request?.user?.login || body.author || "",
      base_branch: body.pull_request?.base?.ref || body.base_branch || "main",
      file_types: body.files || [],
    };

    const decision = analyzeRisk(ctx);

    return NextResponse.json({
      ...decision,
      context: {
        files_changed: ctx.files_changed,
        total_changes: ctx.additions + ctx.deletions,
        base_branch: ctx.base_branch,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
