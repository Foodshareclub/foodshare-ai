/**
 * PR Store Module
 * Handles storing and retrieving pull requests from the database
 */

import { createClient as createServerClient } from "./supabase/server";
import { detectLLMGenerated, type PRData } from "./llm-detection";
import { pr as githubPR } from "./github";

export interface PullRequestRow {
  id: string;
  github_id: number;
  repo_full_name: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  author_login: string;
  author_type: string | null;
  author_id: number | null;
  github_created_at: string | null;
  github_updated_at: string | null;
  github_merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  head_ref: string | null;
  base_ref: string | null;
  head_sha: string | null;
  labels: string[];
  html_url: string | null;
  is_llm_generated: boolean;
  llm_tool: string | null;
  llm_confidence: number | null;
  llm_detection_signals: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string | null;
  state: string;
  draft?: boolean;
  user: {
    login: string;
    type?: string;
    id: number;
  };
  created_at: string;
  updated_at: string;
  merged_at?: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  labels?: Array<{ name: string }>;
  html_url: string;
}

export interface UpsertPRInput {
  pr: GitHubPullRequest;
  repoFullName: string;
  commits?: PRData['commits'];
}

/**
 * Upsert a single pull request with LLM detection
 */
export async function upsertPullRequest(input: UpsertPRInput): Promise<PullRequestRow> {
  const { pr, repoFullName, commits } = input;
  const supabase = await createServerClient();

  // Run LLM detection
  const detection = detectLLMGenerated({
    author: {
      login: pr.user.login,
      type: pr.user.type,
    },
    title: pr.title,
    body: pr.body,
    labels: pr.labels,
    commits,
  });

  const row = {
    github_id: pr.id,
    repo_full_name: repoFullName,
    number: pr.number,
    title: pr.title,
    body: pr.body || null,
    state: pr.state,
    draft: pr.draft || false,
    author_login: pr.user.login,
    author_type: pr.user.type || null,
    author_id: pr.user.id,
    github_created_at: pr.created_at,
    github_updated_at: pr.updated_at,
    github_merged_at: pr.merged_at || null,
    additions: pr.additions || 0,
    deletions: pr.deletions || 0,
    changed_files: pr.changed_files || 0,
    head_ref: pr.head.ref,
    base_ref: pr.base.ref,
    head_sha: pr.head.sha,
    labels: pr.labels?.map(l => l.name) || [],
    html_url: pr.html_url,
    is_llm_generated: detection.isLLMGenerated,
    llm_tool: detection.tool,
    llm_confidence: detection.confidence,
    llm_detection_signals: detection.signals.length > 0 ? { signals: detection.signals } : null,
    synced_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('pull_requests')
    .upsert(row, { onConflict: 'repo_full_name,number' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Sync all PRs from a GitHub repo to the database
 */
export async function syncRepoPRs(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'all'
): Promise<{ synced: number; errors: string[] }> {
  const repoFullName = `${owner}/${repo}`;
  const errors: string[] = [];
  let synced = 0;

  try {
    // Fetch PRs from GitHub
    const prs = await githubPR.list(owner, repo, state) as GitHubPullRequest[];

    // Fetch commits for each PR for co-author detection
    for (const pr of prs) {
      try {
        let commits: PRData['commits'] | undefined;

        // Fetch commits for open PRs or those without many commits
        if (pr.state === 'open' || (pr.changed_files && pr.changed_files < 50)) {
          try {
            commits = await githubPR.commits(owner, repo, pr.number) as PRData['commits'];
          } catch {
            // Ignore commit fetch errors, detection will work without
          }
        }

        await upsertPullRequest({ pr, repoFullName, commits });
        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`PR #${pr.number}: ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to fetch PRs: ${msg}`);
  }

  return { synced, errors };
}

/**
 * Get all PRs for a repo from the database
 */
export async function getRepoPRs(
  repoFullName: string,
  options?: {
    state?: 'open' | 'closed' | 'merged' | 'all';
    llmOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<PullRequestRow[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from('pull_requests')
    .select('*')
    .eq('repo_full_name', repoFullName)
    .order('github_created_at', { ascending: false });

  if (options?.state && options.state !== 'all') {
    if (options.state === 'merged') {
      query = query.not('github_merged_at', 'is', null);
    } else {
      query = query.eq('state', options.state);
    }
  }

  if (options?.llmOnly) {
    query = query.eq('is_llm_generated', true);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Get all stored PRs with optional filters
 */
export async function getAllPRs(options?: {
  llmOnly?: boolean;
  state?: 'open' | 'closed' | 'merged' | 'all';
  limit?: number;
  offset?: number;
}): Promise<PullRequestRow[]> {
  const supabase = await createServerClient();

  let query = supabase
    .from('pull_requests')
    .select('*')
    .order('github_created_at', { ascending: false });

  if (options?.state && options.state !== 'all') {
    if (options.state === 'merged') {
      query = query.not('github_merged_at', 'is', null);
    } else {
      query = query.eq('state', options.state);
    }
  }

  if (options?.llmOnly) {
    query = query.eq('is_llm_generated', true);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Get PR statistics
 */
export async function getPRStats(repoFullName?: string): Promise<{
  total: number;
  llmGenerated: number;
  byTool: Record<string, number>;
  byState: Record<string, number>;
}> {
  const supabase = await createServerClient();

  // Build base query
  let query = supabase.from('pull_requests').select('*');
  if (repoFullName) {
    query = query.eq('repo_full_name', repoFullName);
  }

  const { data, error } = await query;
  if (error) throw error;

  const prs = data || [];
  const total = prs.length;
  const llmGenerated = prs.filter(pr => pr.is_llm_generated).length;

  // Count by tool
  const byTool: Record<string, number> = {};
  for (const pr of prs) {
    if (pr.is_llm_generated && pr.llm_tool) {
      byTool[pr.llm_tool] = (byTool[pr.llm_tool] || 0) + 1;
    }
  }

  // Count by state
  const byState = {
    open: 0,
    closed: 0,
    merged: 0,
  };
  for (const pr of prs) {
    if (pr.github_merged_at) {
      byState.merged++;
    } else if (pr.state === 'open') {
      byState.open++;
    } else if (pr.state === 'closed') {
      byState.closed++;
    }
  }

  return { total, llmGenerated, byTool, byState };
}

/**
 * Get a single PR by repo and number
 */
export async function getPR(repoFullName: string, number: number): Promise<PullRequestRow | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('pull_requests')
    .select('*')
    .eq('repo_full_name', repoFullName)
    .eq('number', number)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

/**
 * Get distinct repos from stored PRs
 */
export async function getStoredRepos(): Promise<string[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('pull_requests')
    .select('repo_full_name')
    .order('repo_full_name');

  if (error) throw error;

  // Get unique repo names
  const repos = new Set<string>();
  for (const row of data || []) {
    repos.add(row.repo_full_name);
  }

  return Array.from(repos);
}
