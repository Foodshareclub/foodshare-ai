import { chat } from "./llm";
import { getPullRequest, getPullRequestDiff, createReview } from "./github";
import { parseDiff, summarizeFiles, truncateDiff } from "./review/analyzer";
import { SYSTEM_PROMPT, buildReviewPrompt } from "./review/prompts";
import {
  CodeReviewResult,
  ReviewCategory,
  parseCategory,
  parseSeverity,
} from "./review/models";

// Re-export types for convenience
export type { CodeReviewResult as ReviewResult } from "./review/models";

export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  categories: ReviewCategory[] = [
    ReviewCategory.SECURITY,
    ReviewCategory.BUG,
    ReviewCategory.PERFORMANCE,
  ]
): Promise<CodeReviewResult> {
  const [prData, diff] = await Promise.all([
    getPullRequest(owner, repo, prNumber),
    getPullRequestDiff(owner, repo, prNumber),
  ]);

  // Parse and analyze the diff
  const parsedFiles = parseDiff(diff);
  const filesSummary = summarizeFiles(parsedFiles);
  const truncatedDiff = truncateDiff(diff, 1000); // ~4000 chars

  // Build the review prompt with category-specific focus
  const prompt = buildReviewPrompt(
    prData.title,
    prData.body || "",
    filesSummary,
    truncatedDiff,
    categories
  );

  // Call LLM with system prompt and review model
  const response = await chat(`${SYSTEM_PROMPT}\n\n${prompt}`, {
    useReviewModel: true,
  });

  try {
    // Extract JSON from response
    let json = response.trim();
    if (json.includes("```json")) {
      json = json.split("```json")[1].split("```")[0];
    } else if (json.includes("```")) {
      json = json.split("```")[1].split("```")[0];
    }

    const parsed = JSON.parse(json.trim());

    // Normalize severity and category values
    const lineComments = (parsed.line_comments || []).map((c: Record<string, unknown>) => ({
      path: String(c.path || ""),
      line: Number(c.line || 0),
      body: String(c.body || ""),
      severity: parseSeverity(String(c.severity || "medium")),
      category: parseCategory(String(c.category || "other")),
      start_line: c.start_line ? Number(c.start_line) : undefined,
    }));

    return {
      summary: {
        overview: parsed.summary?.overview || "",
        changes_description: parsed.summary?.changes_description || "",
        risk_assessment: parsed.summary?.risk_assessment || "Unknown",
        recommendations: parsed.summary?.recommendations || [],
      },
      line_comments: lineComments,
      approval_recommendation: parsed.approval_recommendation || "comment",
    };
  } catch {
    return {
      summary: {
        overview: "Review completed but parsing failed",
        changes_description: "See raw response",
        risk_assessment: "Unknown",
        recommendations: ["Manual review recommended"],
      },
      line_comments: [],
      approval_recommendation: "comment",
    };
  }
}

export async function reviewAndPost(
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ review: CodeReviewResult; posted: boolean }> {
  const review = await reviewPullRequest(owner, repo, prNumber);

  const body = `## AI Code Review

**Overview:** ${review.summary.overview}

**Risk:** ${review.summary.risk_assessment}

### Recommendations
${review.summary.recommendations.map((r) => `- ${r}`).join("\n")}

---
*Found ${review.line_comments.length} issues*`;

  const eventMap = {
    approve: "APPROVE" as const,
    request_changes: "REQUEST_CHANGES" as const,
    comment: "COMMENT" as const,
  };

  const comments = review.line_comments.map((c) => ({
    path: c.path,
    line: c.line,
    body: `**[${c.severity.toUpperCase()}]** ${c.body}`,
  }));

  await createReview(owner, repo, prNumber, body, eventMap[review.approval_recommendation], comments);

  return { review, posted: true };
}
