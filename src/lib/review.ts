import { chat } from "./llm";
import { getPullRequest, getPullRequestDiff, createReview, getCompareCommits } from "./github";
import { parseDiff, summarizeFiles, truncateDiff, filterIgnoredPaths } from "./review/analyzer";
import { SYSTEM_PROMPT, buildReviewPrompt, INCREMENTAL_SYSTEM_PROMPT, buildIncrementalPrompt } from "./review/prompts";
import {
  CodeReviewResult,
  ReviewCategory,
  parseCategory,
  parseSeverity,
  FileWalkthrough,
} from "./review/models";
import { createClient } from "./supabase/server";

export type { CodeReviewResult as ReviewResult } from "./review/models";

interface RepoConfig {
  categories?: string[];
  ignore_paths?: string[];
  custom_instructions?: string;
}

async function getLastReviewedSha(fullName: string, prNumber: number): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("review_history")
    .select("head_sha")
    .eq("repo_full_name", fullName)
    .eq("pr_number", prNumber)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data?.head_sha || null;
}

async function getRepoConfig(fullName: string): Promise<RepoConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repo_configs")
    .select("categories, ignore_paths, custom_instructions")
    .eq("full_name", fullName)
    .single();
  return data || {};
}

export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  categories: ReviewCategory[] = [
    ReviewCategory.SECURITY,
    ReviewCategory.BUG,
    ReviewCategory.PERFORMANCE,
  ],
  lastReviewedSha?: string | null,
  config?: RepoConfig
): Promise<CodeReviewResult & { headSha: string; isIncremental: boolean }> {
  const prData = await getPullRequest(owner, repo, prNumber);
  const headSha = prData.head.sha;

  let diff: string;
  let isIncremental = false;

  if (lastReviewedSha && lastReviewedSha !== headSha) {
    try {
      diff = await getCompareCommits(owner, repo, lastReviewedSha, headSha);
      isIncremental = true;
    } catch {
      diff = await getPullRequestDiff(owner, repo, prNumber);
    }
  } else {
    diff = await getPullRequestDiff(owner, repo, prNumber);
  }

  let parsedFiles = parseDiff(diff);
  
  // Filter ignored paths
  if (config?.ignore_paths?.length) {
    parsedFiles = filterIgnoredPaths(parsedFiles, config.ignore_paths);
  }

  const filesSummary = summarizeFiles(parsedFiles);
  const truncatedDiff = truncateDiff(diff, 2000);

  // Build prompt with custom instructions
  let systemPrompt = isIncremental ? INCREMENTAL_SYSTEM_PROMPT : SYSTEM_PROMPT;
  if (config?.custom_instructions) {
    systemPrompt += `\n\n## Custom Instructions\n${config.custom_instructions}`;
  }

  const prompt = isIncremental
    ? buildIncrementalPrompt(prData.title, filesSummary, truncatedDiff, categories)
    : buildReviewPrompt(prData.title, prData.body || "", filesSummary, truncatedDiff, categories);

  const response = await chat(`${systemPrompt}\n\n${prompt}`, { useReviewModel: true });

  try {
    let json = response.trim();
    if (json.includes("```json")) {
      json = json.split("```json")[1].split("```")[0];
    } else if (json.includes("```")) {
      json = json.split("```")[1].split("```")[0];
    }

    const parsed = JSON.parse(json.trim());

    const lineComments = (parsed.line_comments || []).map((c: Record<string, unknown>) => ({
      path: String(c.path || ""),
      line: Number(c.line || 0),
      body: String(c.body || ""),
      severity: parseSeverity(String(c.severity || "medium")),
      category: parseCategory(String(c.category || "other")),
      start_line: c.start_line ? Number(c.start_line) : undefined,
      suggestion: c.suggestion ? String(c.suggestion) : undefined,
    }));

    const walkthrough: FileWalkthrough[] = (parsed.walkthrough || []).map((w: Record<string, unknown>) => ({
      path: String(w.path || ""),
      summary: String(w.summary || ""),
      changes: Array.isArray(w.changes) ? w.changes.map(String) : [],
    }));

    return {
      summary: {
        overview: parsed.summary?.overview || "",
        changes_description: parsed.summary?.changes_description || "",
        risk_assessment: parsed.summary?.risk_assessment || "Unknown",
        recommendations: parsed.summary?.recommendations || [],
        praise: parsed.summary?.praise || [],
      },
      walkthrough,
      line_comments: lineComments,
      approval_recommendation: parsed.approval_recommendation || "comment",
      headSha,
      isIncremental,
    };
  } catch {
    return {
      summary: {
        overview: "Review completed but parsing failed",
        changes_description: "See raw response",
        risk_assessment: "Unknown",
        recommendations: ["Manual review recommended"],
      },
      walkthrough: [],
      line_comments: [],
      approval_recommendation: "comment",
      headSha,
      isIncremental,
    };
  }
}

function formatReviewBody(review: CodeReviewResult, isIncremental: boolean): string {
  const sections: string[] = [];

  sections.push(isIncremental ? "## 🔄 Incremental Review\n" : "## 🤖 AI Code Review\n");

  if (isIncremental) {
    sections.push("*Reviewing only new changes since last review*\n");
  }

  sections.push(`### Summary\n${review.summary.overview}\n`);
  sections.push(`**Changes:** ${review.summary.changes_description}\n`);
  sections.push(`**Risk Level:** ${review.summary.risk_assessment}\n`);

  if (review.summary.praise?.length) {
    sections.push("### ✨ What's Good\n");
    sections.push(review.summary.praise.map((p) => `- ${p}`).join("\n") + "\n");
  }

  if (review.walkthrough.length > 0) {
    sections.push("### 📝 Walkthrough\n");
    sections.push("<details><summary>File changes</summary>\n");
    for (const file of review.walkthrough) {
      sections.push(`\n**${file.path}**\n${file.summary}`);
      if (file.changes.length > 0) {
        sections.push(file.changes.map((c) => `- ${c}`).join("\n"));
      }
    }
    sections.push("\n</details>\n");
  }

  if (review.summary.recommendations.length > 0) {
    sections.push("### 📋 Recommendations\n");
    sections.push(review.summary.recommendations.map((r) => `- ${r}`).join("\n") + "\n");
  }

  const criticalCount = review.line_comments.filter((c) => c.severity === "critical").length;
  const highCount = review.line_comments.filter((c) => c.severity === "high").length;
  const otherCount = review.line_comments.length - criticalCount - highCount;

  sections.push("---");
  sections.push(`📊 **${review.line_comments.length} comments** `);
  if (criticalCount > 0) sections.push(`| 🔴 ${criticalCount} critical `);
  if (highCount > 0) sections.push(`| 🟠 ${highCount} high `);
  if (otherCount > 0) sections.push(`| 🟡 ${otherCount} other`);

  return sections.join("\n");
}

export async function reviewAndPost(
  owner: string,
  repo: string,
  prNumber: number,
  categories?: ReviewCategory[]
): Promise<{ review: CodeReviewResult; posted: boolean; headSha: string; isIncremental: boolean }> {
  const fullName = `${owner}/${repo}`;
  const [lastReviewedSha, config] = await Promise.all([
    getLastReviewedSha(fullName, prNumber),
    getRepoConfig(fullName),
  ]);

  const reviewCategories = categories || 
    (config.categories?.map((c) => c as ReviewCategory)) ||
    [ReviewCategory.SECURITY, ReviewCategory.BUG, ReviewCategory.PERFORMANCE];

  const result = await reviewPullRequest(owner, repo, prNumber, reviewCategories, lastReviewedSha, config);
  const { headSha, isIncremental, ...review } = result;

  const body = formatReviewBody(review, isIncremental);

  const eventMap = {
    approve: "APPROVE" as const,
    request_changes: "REQUEST_CHANGES" as const,
    comment: "COMMENT" as const,
  };

  const comments = review.line_comments.map((c) => {
    let commentBody = `**[${c.severity.toString().toUpperCase()}]** ${c.body}`;
    if (c.suggestion) {
      commentBody += `\n\n\`\`\`suggestion\n${c.suggestion}\n\`\`\``;
    }
    return { path: c.path, line: c.line, body: commentBody };
  });

  await createReview(owner, repo, prNumber, body, eventMap[review.approval_recommendation], comments);

  return { review, posted: true, headSha, isIncremental };
}
