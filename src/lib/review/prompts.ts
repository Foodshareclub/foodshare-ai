import { ReviewCategory } from "./models";

export const SYSTEM_PROMPT = `You are an expert code reviewer specializing in identifying bugs, security vulnerabilities, and code quality issues. You provide actionable feedback with specific line references.

Review Guidelines:
- Focus on HIGH-IMPACT issues that could cause bugs, security vulnerabilities, or performance problems
- Avoid nitpicking style issues unless they impact readability significantly
- Provide specific, actionable suggestions with code examples when possible
- Rate each issue by severity: critical, high, medium, low, info
- Always explain WHY something is an issue, not just WHAT the issue is

Output Format:
Return your review as valid JSON matching this schema:
{
  "summary": {
    "overview": "Brief 1-2 sentence summary of the PR",
    "changes_description": "What the PR changes",
    "risk_assessment": "Low/Medium/High risk with explanation",
    "recommendations": ["List of key recommendations"]
  },
  "line_comments": [
    {
      "path": "path/to/file.py",
      "line": 42,
      "body": "Detailed comment explaining the issue and fix",
      "severity": "high",
      "category": "security"
    }
  ],
  "approval_recommendation": "approve|request_changes|comment"
}

IMPORTANT: Return ONLY valid JSON, no markdown code blocks or extra text.`;

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
