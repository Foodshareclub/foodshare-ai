/* eslint-disable @typescript-eslint/no-explicit-any */
const GITHUB_API = "https://api.github.com";

class GitHubError extends Error {
  constructor(public status: number, public endpoint: string, message: string) {
    super(`GitHub API [${status}] ${endpoint}: ${message}`);
    this.name = "GitHubError";
  }
}

function getHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(endpoint: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${GITHUB_API}${endpoint}`, { ...init, headers: { ...getHeaders(), ...init?.headers } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubError(res.status, endpoint, body || res.statusText);
  }
  return res.json();
}

async function ghFetchText(endpoint: string, accept: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}${endpoint}`, { headers: { ...getHeaders(), Accept: accept } });
  if (!res.ok) throw new GitHubError(res.status, endpoint, res.statusText);
  return res.text();
}

export async function getPullRequest(owner: string, repo: string, prNumber: number) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`);
}

export async function getPullRequestDiff(owner: string, repo: string, prNumber: number) {
  return ghFetchText(`/repos/${owner}/${repo}/pulls/${prNumber}`, "application/vnd.github.v3.diff");
}

export async function getCompareCommits(owner: string, repo: string, base: string, head: string) {
  return ghFetchText(`/repos/${owner}/${repo}/compare/${base}...${head}`, "application/vnd.github.v3.diff");
}

export async function getPullRequestCommits(owner: string, repo: string, prNumber: number) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/commits`);
}

export async function getPullRequestFiles(owner: string, repo: string, prNumber: number) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
}

export async function createReview(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT" = "COMMENT",
  comments?: Array<{ path: string; line: number; body: string }>
) {
  const payload: Record<string, unknown> = { body, event };
  if (comments?.length) payload.comments = comments;
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createReviewComment(
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  inReplyTo: number
) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, in_reply_to: inReplyTo }),
  });
}

export async function listUserRepos() {
  return ghFetch(`/user/repos?per_page=100&sort=updated`);
}

export async function listOrgRepos(org: string) {
  return ghFetch(`/orgs/${org}/repos?per_page=100&sort=updated`);
}

export async function listPullRequests(owner: string, repo: string, state: "open" | "closed" | "all" = "open") {
  const allPulls: any[] = [];
  let page = 1;
  
  while (true) {
    const data = await ghFetch(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    allPulls.push(...data);
    if (data.length < 100) break;
    page++;
  }
  
  return allPulls;
}
