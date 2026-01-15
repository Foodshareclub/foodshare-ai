import { ReviewCategory } from "./models";

export enum Language {
  TYPESCRIPT = "typescript",
  PYTHON = "python",
  GO = "go",
  RUST = "rust",
  OTHER = "other"
}

export function detectLanguage(filesSummary: string, diffContent: string): Language {
  const content = (filesSummary + diffContent).toLowerCase();
  
  if (content.includes('.ts') || content.includes('.tsx') || content.includes('typescript')) return Language.TYPESCRIPT;
  if (content.includes('.py') || content.includes('python') || content.includes('import ') && content.includes('def ')) return Language.PYTHON;
  if (content.includes('.go') || content.includes('package main') || content.includes('func ')) return Language.GO;
  if (content.includes('.rs') || content.includes('fn ') || content.includes('cargo')) return Language.RUST;
  
  return Language.OTHER;
}

export const SYSTEM_PROMPT = `You are an expert senior code reviewer like CodeRabbit. Provide thorough, actionable feedback.

## Review Philosophy
- Be constructive - suggest improvements, don't just criticize
- Focus on HIGH-IMPACT issues: security, bugs, performance
- Praise good patterns
- Explain "why" behind every suggestion
- Provide code examples for fixes

## What to Review
1. **Security**: SQL injection, XSS, auth issues, secrets exposure
2. **Bugs**: Logic errors, null handling, race conditions, edge cases
3. **Performance**: N+1 queries, memory leaks, inefficient algorithms
4. **Best Practices**: Error handling, typing, naming, DRY

## Severity
- critical: Security vulnerabilities, data loss, crashes
- high: Bugs causing incorrect behavior
- medium: Code smells, edge cases
- low: Minor improvements
- info: Observations, praise

## Output JSON
{
  "summary": {
    "overview": "1-2 sentence summary",
    "changes_description": "What this PR does",
    "risk_assessment": "Low|Medium|High - explanation",
    "recommendations": ["Action items"],
    "praise": ["What's good"],
    "related_issues": ["Potential issues this might affect"]
  },
  "walkthrough": [
    {"path": "file.ts", "summary": "Changes description", "changes": ["Change 1"]}
  ],
  "line_comments": [
    {
      "path": "file.ts",
      "line": 42,
      "body": "Issue with fix suggestion",
      "severity": "high",
      "category": "security",
      "suggestion": "replacement code"
    }
  ],
  "approval_recommendation": "approve|request_changes|comment"
}

Return ONLY valid JSON.`;

export const INCREMENTAL_SYSTEM_PROMPT = `You are an expert code reviewer performing an INCREMENTAL review of NEW changes only.

## Focus
- Review ONLY new/modified code since last review
- Don't repeat previous feedback
- Acknowledge if previous issues were fixed

## Severity
- critical: Security vulnerabilities, data loss
- high: Bugs causing incorrect behavior
- medium: Code smells, edge cases
- low: Minor improvements
- info: Observations

## Output JSON
{
  "summary": {
    "overview": "Summary of new changes",
    "changes_description": "What changed",
    "risk_assessment": "Low|Medium|High",
    "recommendations": ["Action items"],
    "praise": ["What's good"],
    "previous_issues_addressed": ["Issues fixed from last review"]
  },
  "walkthrough": [
    {"path": "file.ts", "summary": "What changed", "changes": ["Change 1"]}
  ],
  "line_comments": [
    {
      "path": "file.ts",
      "line": 42,
      "body": "Issue with fix",
      "severity": "high",
      "category": "security",
      "suggestion": "replacement code"
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

const BEST_PRACTICES_FOCUS = `
- SOLID principles adherence
- DRY (Don't Repeat Yourself) violations
- Proper error handling and logging
- TypeScript best practices (strict typing, no any)
- Clean code principles (naming, single responsibility)
- Code organization and modularity
- Proper async/await usage
- Accessibility compliance (a11y)
- Testing considerations
- Documentation and comments where needed
`;

const LANGUAGE_SPECIFIC_FOCUS = {
  [Language.TYPESCRIPT]: `
- TypeScript-specific: strict typing, avoid 'any', proper generics usage
- React patterns if applicable (hooks, component structure)
- Node.js best practices for backend code
- Proper async/await and Promise handling
- ESLint/Prettier compliance
`,
  [Language.PYTHON]: `
- Python-specific: PEP 8 compliance, type hints, proper imports
- Django/Flask patterns if applicable
- Proper exception handling with try/except
- List comprehensions vs loops efficiency
- Virtual environment and dependency management
`,
  [Language.GO]: `
- Go-specific: proper error handling, goroutine safety
- Interface usage and composition over inheritance
- Memory management and garbage collection considerations
- Proper use of channels and select statements
- Go modules and package organization
`,
  [Language.RUST]: `
- Rust-specific: ownership, borrowing, and lifetime management
- Proper error handling with Result<T, E>
- Memory safety without garbage collection
- Trait usage and generic programming
- Cargo.toml dependencies and features
`,
  [Language.OTHER]: ""
};

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
    ReviewCategory.BEST_PRACTICES,
  ]
): string {
  const language = detectLanguage(filesSummary, diffContent);
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
  if (categories.includes(ReviewCategory.BEST_PRACTICES)) {
    focusParts.push(BEST_PRACTICES_FOCUS);
  }

  // Add language-specific focus
  const langFocus = LANGUAGE_SPECIFIC_FOCUS[language];
  if (langFocus) {
    focusParts.push(langFocus);
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
    ReviewCategory.BEST_PRACTICES,
  ]
): string {
  const language = detectLanguage(filesSummary, diffContent);
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
  if (categories.includes(ReviewCategory.BEST_PRACTICES)) {
    focusParts.push(BEST_PRACTICES_FOCUS);
  }

  // Add language-specific focus
  const langFocus = LANGUAGE_SPECIFIC_FOCUS[language];
  if (langFocus) {
    focusParts.push(langFocus);
  }

  return INCREMENTAL_PROMPT_TEMPLATE
    .replace("{pr_title}", prTitle)
    .replace("{files_summary}", filesSummary)
    .replace("{diff_content}", diffContent)
    .replace("{review_focus}", focusParts.length > 0 ? focusParts.join("\n") : "General code quality review");
}
