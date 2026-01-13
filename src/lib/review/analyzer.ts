export interface DiffHunk {
  path: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  content: string;
}

export interface FileDiff {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
  hunks: DiffHunk[];
}

const FILE_PATTERN = /^diff --git a\/(.*) b\/(.*)$/;
const HUNK_PATTERN = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/;

export function parseDiff(diffText: string): FileDiff[] {
  const files: FileDiff[] = [];
  let currentFile: FileDiff | null = null;
  let currentHunks: DiffHunk[] = [];

  const lines = diffText.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fileMatch = line.match(FILE_PATTERN);
    if (fileMatch) {
      if (currentFile) {
        currentFile.hunks = currentHunks;
        files.push(currentFile);
      }

      const path = fileMatch[2];
      currentFile = {
        path,
        status: "modified",
        additions: 0,
        deletions: 0,
        patch: "",
        hunks: [],
      };
      currentHunks = [];
      i++;
      continue;
    }

    const hunkMatch = line.match(HUNK_PATTERN);
    if (hunkMatch && currentFile) {
      const oldStart = parseInt(hunkMatch[1], 10);
      const oldCount = parseInt(hunkMatch[2] || "1", 10);
      const newStart = parseInt(hunkMatch[3], 10);
      const newCount = parseInt(hunkMatch[4] || "1", 10);

      const hunkContent: string[] = [line];
      i++;

      while (
        i < lines.length &&
        !lines[i].startsWith("diff --git") &&
        !lines[i].startsWith("@@")
      ) {
        hunkContent.push(lines[i]);
        if (lines[i].startsWith("+") && !lines[i].startsWith("+++")) {
          currentFile.additions++;
        } else if (lines[i].startsWith("-") && !lines[i].startsWith("---")) {
          currentFile.deletions++;
        }
        i++;
      }

      currentHunks.push({
        path: currentFile.path,
        oldStart,
        oldCount,
        newStart,
        newCount,
        content: hunkContent.join("\n"),
      });
      continue;
    }

    i++;
  }

  if (currentFile) {
    currentFile.hunks = currentHunks;
    files.push(currentFile);
  }

  return files;
}

export function summarizeFiles(files: FileDiff[]): string {
  const lines = files.map(
    (f) => `- ${f.path}: +${f.additions}/-${f.deletions} lines`
  );
  return lines.length > 0 ? lines.join("\n") : "No files changed";
}

export function filterIgnoredPaths(files: FileDiff[], ignorePaths: string[]): FileDiff[] {
  if (!ignorePaths.length) return files;
  return files.filter((f) => {
    return !ignorePaths.some((pattern) => {
      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        return regex.test(f.path);
      }
      return f.path.startsWith(pattern) || f.path.includes(pattern);
    });
  });
}

// Files to skip entirely (auto-generated, lock files)
const SKIP_FILES = new Set([
  "Cargo.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "Gemfile.lock",
  "composer.lock",
  "go.sum",
]);

const SKIP_PATTERNS = [".min.js", ".min.css", "bundle.js", "vendor.js"];

// File patterns to deprioritize (review last, truncate first)
const LOW_PRIORITY_PATTERNS = [
  ".lock",
  ".sum",
  ".map",
  ".generated",
  ".snap",
  "test",
  "spec",
  "mock",
  "__pycache__",
  ".pyc",
];

function shouldSkipFile(path: string): boolean {
  const filename = path.split("/").pop() || "";
  if (SKIP_FILES.has(filename)) {
    return true;
  }
  for (const pattern of SKIP_PATTERNS) {
    if (path.includes(pattern)) {
      return true;
    }
  }
  return false;
}

function getFilePriority(path: string): number {
  const pathLower = path.toLowerCase();
  for (const pattern of LOW_PRIORITY_PATTERNS) {
    if (pathLower.includes(pattern)) {
      return 2;
    }
  }
  if ([".md", ".txt", ".json", ".yaml", ".yml", ".toml"].some((ext) => path.includes(ext))) {
    return 1;
  }
  return 0; // Source code is highest priority
}

export function filterAndPrioritizeDiff(diff: string): string {
  const files = parseDiff(diff);

  // Filter and sort
  const filtered = files
    .filter((f) => !shouldSkipFile(f.path))
    .sort((a, b) => getFilePriority(a.path) - getFilePriority(b.path));

  // Rebuild diff from filtered/sorted files
  const resultParts: string[] = [];
  for (const f of filtered) {
    for (const hunk of f.hunks) {
      resultParts.push(`diff --git a/${f.path} b/${f.path}`);
      resultParts.push(hunk.content);
    }
  }

  return resultParts.join("\n");
}

export function truncateDiff(diff: string, maxTokens: number = 1000): string {
  // First, filter and prioritize
  const filteredDiff = filterAndPrioritizeDiff(diff);

  // Estimate tokens (roughly 4 chars per token)
  const maxChars = maxTokens * 4;

  if (filteredDiff.length <= maxChars) {
    return filteredDiff;
  }

  // Truncate with notice
  let truncated = filteredDiff.slice(0, maxChars);

  // Try to end at a file boundary
  const lastDiff = truncated.lastIndexOf("\ndiff --git");
  if (lastDiff > maxChars * 0.5) {
    truncated = truncated.slice(0, lastDiff);
  }

  const originalCount = parseDiff(diff).length;
  const truncatedCount = parseDiff(truncated).length;
  const skippedCount = originalCount - truncatedCount;

  return truncated + `\n\n... [truncated - ${skippedCount} more files not shown]`;
}
