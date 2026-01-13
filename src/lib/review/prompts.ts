import { ReviewCategory } from "./models";

export const SYSTEM_PROMPT = `You are an expert senior code reviewer. You provide thorough, actionable feedback like a skilled tech lead would.

## Review Philosophy
- Be constructive, not critical - suggest improvements, don't just point out flaws
- Focus on HIGH-IMPACT issues: bugs, security vulnerabilities, performance problems
- Praise good patterns when you see them
- Explain the "why" behind every suggestion
- Provide code examples for fixes when helpful

## Severity Guidelines
- critical: Security vulnerabilities, data loss risks, crashes
- high: Bugs that will cause incorrect behavior, major performance issues
- medium: Code smells, potential edge cases, maintainability concerns
- low: Minor improvements, style suggestions
- info: Observations, praise for good code

## Output Format
Return valid JSON:
{
  "summary": {
    "overview": "1-2 sentence PR summary",
    "changes_description": "What this PR accomplishes",
    "risk_assessment": "Low|Medium|High - with brief explanation",
    "recommendations": ["Key action items"],
    "praise": ["What was done well"]
  },
  "walkthrough": [
    {
      "path": "file.ts",
      "summary": "Brief description of changes in this file",
      "changes": ["List of specific changes"]
    }
  ],
  "line_comments": [
    {
      "path": "file.ts",
      "line": 42,
      "body": "Issue explanation with suggested fix",
      "severity": "high",
      "category": "security",
      "suggestion": "Optional: replacement code snippet"
    }
  ],
  "approval_recommendation": "approve|request_changes|comment"
}

Return ONLY valid JSON.`;

export const INCREMENTAL_SYSTEM_PROMPT = `You are an expert senior code reviewer performing an INCREMENTAL review.

## Incremental Review Context
You are reviewing ONLY the new changes since the last review. Focus exclusively on:
- New code added in this update
- Modified lines since last review
- Do NOT repeat feedback on unchanged code

## Review Philosophy
- Be constructive and focused on the new changes only
- Acknowledge if previous feedback was addressed
- Focus on HIGH-IMPACT issues in the new code

## Severity Guidelines
- critical: Security vulnerabilities, data loss risks, crashes
- high: Bugs that will cause incorrect behavior
- medium: Code smells, potential edge cases
- low: Minor improvements
- info: Observations, praise

## Output Format
Return valid JSON:
{
  "summary": {
    "overview": "Summary of new changes",
    "changes_description": "What changed since last review",
    "risk_assessment": "Low|Medium|High",
    "recommendations": ["Action items for new code"],
    "praise": ["What's good in new changes"]
  },
  "walkthrough": [
    {
      "path": "file.ts",
      "summary": "What changed in this file",
      "changes": ["Specific changes"]
    }
  ],
  "line_comments": [
    {
      "path": "file.ts",
      "line": 42,
      "body": "Issue with suggested fix",
      "severity": "high",
      "category": "security",
      "suggestion": "Optional: replacement code"
    }
  ],
  "approval_recommendation": "approve|request_changes|comment"
}

Return ONLY valid JSON.`;

const REVIEW_PROMPT_TEMPLATE = `Review the following pull request diff.

## PR Information
- Title: {pr_title}
- Description: {pr_description}

## Changed Files
{files_summary}

## Diff
\`\`\`diff
{diff_content}
\`\`\`

## Review Focus Areas
{review_focus}

Provide your review in the JSON format specified in your instructions.`;

const SECURITY_FOCUS = `
- Input validation and sanitization
- SQL injection, XSS, command injection risks
- Authentication/authorization issues
- Sensitive data exposure (API keys, credentials, PII)
- Insecure cryptographic practices
- OWASP Top 10 vulnerabilities
`;

const BUG_FOCUS = `
- Logic errors and edge cases
- Null/undefined handling
- Race conditions
- Error handling gaps
- Type mismatches
- Off-by-one errors
`;

const PERFORMANCE_FOCUS = `
- N+1 query patterns
- Unnecessary loops or iterations
- Memory leaks
- Blocking operations in async code
- Missing caching opportunities
- Inefficient algorithms
`;

export function truncateDescription(description: string, maxChars: number = 1000): string {
  if (!description) {
    return "No description provided";
  }
  if (description.length <= maxChars) {
    return description;
  }
  return description.slice(0, maxChars) + "\n... [description truncated]";
}

export function buildReviewPrompt(
  prTitle: string,
  prDescription: string,
  filesSummary: string,
  diffContent: string,
  categories: ReviewCategory[] = [
    ReviewCategory.SECURITY,
    ReviewCategory.BUG,
    ReviewCategory.PERFORMANCE,
  ]
): string {
  const focusParts: string[] = [];

  if (categories.includes(ReviewCategory.SECURITY)) {
    focusParts.push(SECURITY_FOCUS);
  }
  if (categories.includes(ReviewCategory.BUG)) {
    focusParts.push(BUG_FOCUS);
  }
  if (categories.includes(ReviewCategory.PERFORMANCE)) {
    focusParts.push(PERFORMANCE_FOCUS);
  }

  return REVIEW_PROMPT_TEMPLATE
    .replace("{pr_title}", prTitle)
    .replace("{pr_description}", truncateDescription(prDescription))
    .replace("{files_summary}", filesSummary)
    .replace("{diff_content}", diffContent)
    .replace("{review_focus}", focusParts.length > 0 ? focusParts.join("\n") : "General code quality review");
}


const INCREMENTAL_PROMPT_TEMPLATE = `Review the following NEW CHANGES since the last review.

## PR Title
{pr_title}

## Changed Files (since last review)
{files_summary}

## New Diff
\`\`\`diff
{diff_content}
\`\`\`

## Review Focus Areas
{review_focus}

Remember: Only comment on the NEW changes shown above. Do not repeat previous feedback.`;

export function buildIncrementalPrompt(
  prTitle: string,
  filesSummary: string,
  diffContent: string,
  categories: ReviewCategory[] = [
    ReviewCategory.SECURITY,
    ReviewCategory.BUG,
    ReviewCategory.PERFORMANCE,
  ]
): string {
  const focusParts: string[] = [];

  if (categories.includes(ReviewCategory.SECURITY)) {
    focusParts.push(SECURITY_FOCUS);
  }
  if (categories.includes(ReviewCategory.BUG)) {
    focusParts.push(BUG_FOCUS);
  }
  if (categories.includes(ReviewCategory.PERFORMANCE)) {
    focusParts.push(PERFORMANCE_FOCUS);
  }

  return INCREMENTAL_PROMPT_TEMPLATE
    .replace("{pr_title}", prTitle)
    .replace("{files_summary}", filesSummary)
    .replace("{diff_content}", diffContent)
    .replace("{review_focus}", focusParts.length > 0 ? focusParts.join("\n") : "General code quality review");
}
