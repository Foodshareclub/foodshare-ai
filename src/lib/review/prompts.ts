import { ReviewCategory } from "./models";

export enum Language {
  TYPESCRIPT = "typescript",
  JAVASCRIPT = "javascript",
  PYTHON = "python",
  GO = "go",
  RUST = "rust",
  JAVA = "java",
  KOTLIN = "kotlin",
  SWIFT = "swift",
  CSHARP = "csharp",
  CPP = "cpp",
  RUBY = "ruby",
  PHP = "php",
  SCALA = "scala",
  SQL = "sql",
  SHELL = "shell",
  YAML = "yaml",
  TERRAFORM = "terraform",
  DOCKER = "docker",
  OTHER = "other"
}

export function detectLanguage(filesSummary: string, diffContent: string): Language {
  const content = (filesSummary + diffContent).toLowerCase();
  
  if (content.includes('.tsx') || content.includes('.ts')) return Language.TYPESCRIPT;
  if (content.includes('.jsx') || (content.includes('.js') && !content.includes('.json'))) return Language.JAVASCRIPT;
  if (content.includes('.py') || content.includes('def ') && content.includes('import ')) return Language.PYTHON;
  if (content.includes('.go') || content.includes('package main') || content.includes('func (')) return Language.GO;
  if (content.includes('.rs') || content.includes('fn ') && content.includes('let ')) return Language.RUST;
  if (content.includes('.java') || content.includes('public class')) return Language.JAVA;
  if (content.includes('.kt') || content.includes('fun ') && content.includes('val ')) return Language.KOTLIN;
  if (content.includes('.swift') || content.includes('func ') && content.includes('var ')) return Language.SWIFT;
  if (content.includes('.cs') || content.includes('namespace ')) return Language.CSHARP;
  if (content.includes('.cpp') || content.includes('.hpp') || content.includes('#include')) return Language.CPP;
  if (content.includes('.rb') || content.includes('def ') && content.includes('end')) return Language.RUBY;
  if (content.includes('.php') || content.includes('<?php')) return Language.PHP;
  if (content.includes('.scala') || content.includes('object ') && content.includes('def ')) return Language.SCALA;
  if (content.includes('.sql') || content.includes('select ') && content.includes('from ')) return Language.SQL;
  if (content.includes('.sh') || content.includes('#!/bin/bash')) return Language.SHELL;
  if (content.includes('.tf') || content.includes('resource "')) return Language.TERRAFORM;
  if (content.includes('dockerfile') || content.includes('from ') && content.includes('run ')) return Language.DOCKER;
  if (content.includes('.yaml') || content.includes('.yml')) return Language.YAML;
  
  return Language.OTHER;
}

export const SYSTEM_PROMPT = `You are an expert senior code reviewer. Provide thorough, actionable feedback.

## Review Philosophy
- Be constructive - suggest improvements, don't just criticize
- Focus on HIGH-IMPACT issues: security, bugs, performance
- Praise good patterns
- Explain "why" behind every suggestion
- Provide code examples for fixes

## What to Review
1. **Security**: SQL injection, XSS, auth issues, secrets exposure, CSRF, SSRF
2. **Bugs**: Logic errors, null handling, race conditions, edge cases, off-by-one
3. **Performance**: N+1 queries, memory leaks, inefficient algorithms, blocking I/O
4. **Best Practices**: Error handling, typing, naming, DRY, SOLID
5. **Testing**: Missing tests, test coverage gaps, test quality
6. **Architecture**: Coupling, cohesion, separation of concerns
7. **Accessibility**: a11y compliance, WCAG guidelines
8. **API Design**: RESTful conventions, error responses, versioning
9. **Database**: Schema design, migrations, query optimization
10. **DevOps**: Config management, secrets, deployment concerns

## Severity
- critical: Security vulnerabilities, data loss, crashes, auth bypass
- high: Bugs causing incorrect behavior, data corruption
- medium: Code smells, edge cases, maintainability issues
- low: Minor improvements, style suggestions
- info: Observations, praise, learning opportunities

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
## Security Review
- Input validation and sanitization (all user inputs)
- SQL injection, XSS, command injection, path traversal
- Authentication/authorization flaws (broken auth, privilege escalation)
- Sensitive data exposure (API keys, credentials, PII, tokens in logs)
- Insecure cryptographic practices (weak algorithms, hardcoded secrets)
- CSRF, SSRF, open redirects
- Insecure deserialization
- XML external entities (XXE)
- Security misconfigurations
- OWASP Top 10 vulnerabilities
- Dependency vulnerabilities (known CVEs)
`;

const BUG_FOCUS = `
## Bug Detection
- Logic errors and incorrect conditions
- Null/undefined/nil handling and null pointer exceptions
- Race conditions and concurrency bugs
- Error handling gaps (unhandled exceptions, silent failures)
- Type mismatches and coercion issues
- Off-by-one errors and boundary conditions
- Resource leaks (unclosed connections, file handles)
- Infinite loops and recursion without base case
- State management issues
- Data validation gaps
`;

const PERFORMANCE_FOCUS = `
## Performance Review
- N+1 query patterns and database optimization
- Unnecessary loops, iterations, or computations
- Memory leaks and excessive allocations
- Blocking operations in async code
- Missing caching opportunities
- Inefficient algorithms (O(n²) when O(n) possible)
- Large payload sizes and unnecessary data transfer
- Missing pagination for large datasets
- Unoptimized regex patterns
- Bundle size impact (frontend)
`;

const BEST_PRACTICES_FOCUS = `
## Best Practices
- SOLID principles adherence
- DRY (Don't Repeat Yourself) violations
- Proper error handling, logging, and monitoring
- Strong typing (avoid any/unknown, proper generics)
- Clean code (meaningful names, single responsibility)
- Code organization and modularity
- Proper async/await and Promise handling
- Accessibility compliance (a11y, WCAG)
- Internationalization readiness (i18n)
- Documentation and comments where needed
- Consistent code style
`;

const TESTING_FOCUS = `
## Testing Review
- Missing unit tests for new code
- Test coverage gaps for edge cases
- Test quality (meaningful assertions, not just coverage)
- Missing integration tests for API endpoints
- Mocking strategy (over-mocking, under-mocking)
- Test isolation and independence
- Flaky test patterns
- Missing error case tests
`;

const API_FOCUS = `
## API Design Review
- RESTful conventions and HTTP method usage
- Proper status codes and error responses
- Request/response validation
- API versioning strategy
- Rate limiting considerations
- Pagination and filtering
- Consistent naming conventions
- OpenAPI/documentation alignment
`;

const DATABASE_FOCUS = `
## Database Review
- Schema design and normalization
- Migration safety (backwards compatible, rollback plan)
- Index usage and query optimization
- Transaction handling and isolation levels
- Connection pooling and resource management
- Data integrity constraints
- Soft delete vs hard delete considerations
`;

const DEVOPS_FOCUS = `
## DevOps Review
- Configuration management (env vars, secrets)
- Docker/container best practices
- CI/CD pipeline considerations
- Logging and monitoring hooks
- Health check endpoints
- Graceful shutdown handling
- Resource limits and scaling
`;

const ARCHITECTURE_FOCUS = `
## Architecture Review
- Separation of concerns
- Coupling and cohesion
- Dependency injection patterns
- Interface segregation
- Single responsibility at module level
- Circular dependency detection
- Layer violations (e.g., UI calling DB directly)
`;

const LANGUAGE_SPECIFIC_FOCUS: Record<Language, string> = {
  [Language.TYPESCRIPT]: `
## TypeScript Specific
- Strict typing, avoid 'any', proper generics usage
- Proper null checks with strictNullChecks
- React patterns (hooks rules, component structure, memo usage)
- Node.js best practices for backend code
- Proper async/await and Promise handling
- Type guards and discriminated unions
- ESLint/Prettier compliance
`,
  [Language.JAVASCRIPT]: `
## JavaScript Specific
- Modern ES6+ syntax usage
- Proper error handling with try/catch
- Avoid var, use const/let appropriately
- Prototype pollution risks
- Event listener cleanup
- Memory management in closures
`,
  [Language.PYTHON]: `
## Python Specific
- PEP 8 compliance and pythonic idioms
- Type hints (PEP 484) usage
- Proper exception handling with specific exceptions
- Context managers for resource management
- List comprehensions vs loops efficiency
- Django/Flask/FastAPI patterns if applicable
- Async/await with asyncio
- f-strings over format()
`,
  [Language.GO]: `
## Go Specific
- Proper error handling (check all errors, wrap with context)
- Goroutine safety and race conditions
- Interface usage and composition
- Memory management and garbage collection
- Proper use of channels and select
- Context propagation for cancellation
- Go modules and package organization
- Defer usage for cleanup
`,
  [Language.RUST]: `
## Rust Specific
- Ownership, borrowing, and lifetime management
- Proper error handling with Result<T, E> and ?
- Memory safety patterns
- Trait usage and generic programming
- Unsafe code review (if present)
- Clippy lint compliance
- Cargo.toml dependencies and features
- Pattern matching exhaustiveness
`,
  [Language.JAVA]: `
## Java Specific
- Null safety (Optional usage, @Nullable annotations)
- Exception handling (checked vs unchecked)
- Stream API usage and performance
- Spring patterns if applicable (DI, AOP)
- Thread safety and synchronization
- Resource management (try-with-resources)
- Immutability patterns
- Lombok usage appropriateness
`,
  [Language.KOTLIN]: `
## Kotlin Specific
- Null safety with nullable types
- Data classes and sealed classes usage
- Coroutines and Flow for async
- Extension functions appropriateness
- Kotlin idioms over Java patterns
- Scope functions (let, run, apply, also)
`,
  [Language.SWIFT]: `
## Swift Specific
- Optional handling and unwrapping safety
- Protocol-oriented programming
- Memory management (ARC, weak/unowned)
- Error handling with throws
- SwiftUI vs UIKit patterns
- Codable for serialization
- Actor isolation for concurrency
`,
  [Language.CSHARP]: `
## C# Specific
- Null safety (nullable reference types)
- Async/await patterns
- LINQ usage and performance
- Dependency injection patterns
- Exception handling best practices
- IDisposable and using statements
- Record types for immutability
`,
  [Language.CPP]: `
## C++ Specific
- Memory management (RAII, smart pointers)
- Const correctness
- Move semantics and perfect forwarding
- Exception safety guarantees
- STL usage and iterator invalidation
- Undefined behavior risks
- Header organization
`,
  [Language.RUBY]: `
## Ruby Specific
- Ruby idioms and conventions
- Block and proc usage
- Rails patterns if applicable (MVC, ActiveRecord)
- Exception handling with begin/rescue
- Symbol vs string usage
- Metaprogramming safety
`,
  [Language.PHP]: `
## PHP Specific
- Type declarations and strict_types
- PSR standards compliance
- SQL injection prevention (prepared statements)
- Laravel/Symfony patterns if applicable
- Composer dependency management
- Error handling and logging
`,
  [Language.SCALA]: `
## Scala Specific
- Functional programming patterns
- Option/Either for error handling
- Immutability and val usage
- Pattern matching
- Implicit usage and readability
- Akka patterns if applicable
`,
  [Language.SQL]: `
## SQL Specific
- Query optimization and index usage
- SQL injection prevention
- Transaction isolation levels
- Deadlock prevention
- Migration safety
- Proper JOIN usage
- Avoiding SELECT *
`,
  [Language.SHELL]: `
## Shell Script Specific
- Shellcheck compliance
- Proper quoting and escaping
- Error handling with set -e
- Portable POSIX compliance
- Security (command injection risks)
- Input validation
`,
  [Language.TERRAFORM]: `
## Terraform Specific
- Resource naming conventions
- Module organization
- State management safety
- Security group rules review
- IAM policy least privilege
- Sensitive data handling
- Drift detection considerations
`,
  [Language.DOCKER]: `
## Docker Specific
- Multi-stage builds for size
- Security (non-root user, minimal base image)
- Layer caching optimization
- Health checks
- Proper signal handling
- Secret management
`,
  [Language.YAML]: `
## YAML/Config Specific
- Schema validation
- Secret exposure risks
- Environment-specific configs
- Proper indentation
- Anchor/alias usage
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
  ],
  depth: "quick" | "standard" | "deep" = "standard"
): string {
  const language = detectLanguage(filesSummary, diffContent);
  const focusParts: string[] = [];

  // Core categories
  if (categories.includes(ReviewCategory.SECURITY)) focusParts.push(SECURITY_FOCUS);
  if (categories.includes(ReviewCategory.BUG)) focusParts.push(BUG_FOCUS);
  if (categories.includes(ReviewCategory.PERFORMANCE)) focusParts.push(PERFORMANCE_FOCUS);
  if (categories.includes(ReviewCategory.BEST_PRACTICES)) focusParts.push(BEST_PRACTICES_FOCUS);
  
  // Extended categories for deep scans
  if (depth === "deep" || categories.includes(ReviewCategory.TESTING)) focusParts.push(TESTING_FOCUS);
  if (depth === "deep" || categories.includes(ReviewCategory.API)) focusParts.push(API_FOCUS);
  if (depth === "deep" || categories.includes(ReviewCategory.DATABASE)) focusParts.push(DATABASE_FOCUS);
  if (depth === "deep" || categories.includes(ReviewCategory.DEVOPS)) focusParts.push(DEVOPS_FOCUS);
  if (depth === "deep" || categories.includes(ReviewCategory.ARCHITECTURE)) focusParts.push(ARCHITECTURE_FOCUS);

  // Language-specific focus
  const langFocus = LANGUAGE_SPECIFIC_FOCUS[language];
  if (langFocus) focusParts.push(langFocus);

  // Add depth-specific instructions
  let depthInstruction = "";
  if (depth === "quick") {
    depthInstruction = "\n## Review Depth: QUICK\nFocus only on critical security issues and obvious bugs. Skip style and minor suggestions.\n";
  } else if (depth === "deep") {
    depthInstruction = "\n## Review Depth: DEEP\nPerform exhaustive review. Check every line. Include architecture, testing gaps, and future maintainability concerns.\n";
  }

  return REVIEW_PROMPT_TEMPLATE
    .replace("{pr_title}", prTitle)
    .replace("{pr_description}", truncateDescription(prDescription))
    .replace("{files_summary}", filesSummary)
    .replace("{diff_content}", diffContent)
    .replace("{review_focus}", depthInstruction + (focusParts.length > 0 ? focusParts.join("\n") : "General code quality review"));
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
  ],
  depth: "quick" | "standard" | "deep" = "standard"
): string {
  const language = detectLanguage(filesSummary, diffContent);
  const focusParts: string[] = [];

  if (categories.includes(ReviewCategory.SECURITY)) focusParts.push(SECURITY_FOCUS);
  if (categories.includes(ReviewCategory.BUG)) focusParts.push(BUG_FOCUS);
  if (categories.includes(ReviewCategory.PERFORMANCE)) focusParts.push(PERFORMANCE_FOCUS);
  if (categories.includes(ReviewCategory.BEST_PRACTICES)) focusParts.push(BEST_PRACTICES_FOCUS);
  
  if (depth === "deep" || categories.includes(ReviewCategory.TESTING)) focusParts.push(TESTING_FOCUS);
  if (depth === "deep" || categories.includes(ReviewCategory.API)) focusParts.push(API_FOCUS);
  if (depth === "deep" || categories.includes(ReviewCategory.DATABASE)) focusParts.push(DATABASE_FOCUS);

  const langFocus = LANGUAGE_SPECIFIC_FOCUS[language];
  if (langFocus) focusParts.push(langFocus);

  return INCREMENTAL_PROMPT_TEMPLATE
    .replace("{pr_title}", prTitle)
    .replace("{files_summary}", filesSummary)
    .replace("{diff_content}", diffContent)
    .replace("{review_focus}", focusParts.length > 0 ? focusParts.join("\n") : "General code quality review");
}
