/**
 * GitHub API type definitions
 */

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  pushed_at: string;
  updated_at: string;
  default_branch: string;
  owner: {
    login: string;
  };
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft: boolean;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  changed_files?: number;
  additions?: number;
  deletions?: number;
}

export interface GitHubLabel {
  name: string;
  color?: string;
}

export interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface ParsedPRData {
  title: string;
  body: string | null;
  head: {
    sha: string;
    ref: string;
  };
  base: {
    ref: string;
  };
  labels: GitHubLabel[];
  changed_files?: number;
  additions?: number;
  deletions?: number;
}

export interface BatchReviewResult {
  owner: string;
  repo: string;
  pr_number: number;
  success: boolean;
  issues?: number;
  error?: string;
}

export interface RepoListItem {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  updated_at: string;
}
