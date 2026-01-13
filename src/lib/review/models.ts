export enum Severity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

export enum ReviewCategory {
  SECURITY = "security",
  BUG = "bug",
  PERFORMANCE = "performance",
  STYLE = "style",
  SUGGESTION = "suggestion",
  DEPENDENCY = "dependency",
  MAINTAINABILITY = "maintainability",
  OTHER = "other",
}

export interface LineComment {
  path: string;
  line: number;
  body: string;
  severity: Severity | string;
  category: ReviewCategory | string;
  start_line?: number;
}

export interface ReviewSummary {
  overview: string;
  changes_description: string;
  risk_assessment: string;
  recommendations: string[];
}

export interface CodeReviewResult {
  summary: ReviewSummary;
  line_comments: LineComment[];
  approval_recommendation: "approve" | "request_changes" | "comment";
}

export interface ReviewRequest {
  owner: string;
  repo: string;
  pr_number: number;
  review_types?: ReviewCategory[];
}

export function parseSeverity(value: string): Severity {
  const normalized = value?.toLowerCase();
  if (Object.values(Severity).includes(normalized as Severity)) {
    return normalized as Severity;
  }
  return Severity.MEDIUM;
}

export function parseCategory(value: string): ReviewCategory {
  const normalized = value?.toLowerCase();
  if (Object.values(ReviewCategory).includes(normalized as ReviewCategory)) {
    return normalized as ReviewCategory;
  }
  return ReviewCategory.OTHER;
}
