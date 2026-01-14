const GITHUB_API = "https://api.github.com";

class GitHubError extends Error {
  constructor(public status: number, public endpoint: string, message: string) {
    super(`GitHub API [${status}] ${endpoint}: ${message}`);
    this.name = "GitHubError";
  }
}

function getToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return token;
}

const headers = () => ({
  Authorization: `Bearer ${getToken()}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

async function gh<T = unknown>(endpoint: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GITHUB_API}${endpoint}`, { ...init, headers: { ...headers(), ...init?.headers } });
  if (!res.ok) throw new GitHubError(res.status, endpoint, await res.text().catch(() => res.statusText));
  return res.json();
}

async function ghText(endpoint: string, accept: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}${endpoint}`, { headers: { ...headers(), Accept: accept } });
  if (!res.ok) throw new GitHubError(res.status, endpoint, res.statusText);
  return res.text();
}

async function ghPaginate<T>(endpoint: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; ; page++) {
    const data = await gh<T[]>(`${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
    if (!data?.length) break;
    results.push(...data);
    if (data.length < 100) break;
  }
  return results;
}

// PR operations
export const pr = {
  get: (owner: string, repo: string, num: number) => gh(`/repos/${owner}/${repo}/pulls/${num}`),
  diff: (owner: string, repo: string, num: number) => ghText(`/repos/${owner}/${repo}/pulls/${num}`, "application/vnd.github.v3.diff"),
  commits: (owner: string, repo: string, num: number) => gh(`/repos/${owner}/${repo}/pulls/${num}/commits`),
  files: (owner: string, repo: string, num: number) => gh(`/repos/${owner}/${repo}/pulls/${num}/files`),
  list: (owner: string, repo: string, state: "open" | "closed" | "all" = "open") => ghPaginate(`/repos/${owner}/${repo}/pulls?state=${state}`),
  compare: (owner: string, repo: string, base: string, head: string) => ghText(`/repos/${owner}/${repo}/compare/${base}...${head}`, "application/vnd.github.v3.diff"),
};

// Review operations
export const review = {
  create: (owner: string, repo: string, num: number, body: string, event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT" = "COMMENT", comments?: { path: string; line: number; body: string }[]) =>
    gh(`/repos/${owner}/${repo}/pulls/${num}/reviews`, { method: "POST", body: JSON.stringify({ body, event, ...(comments?.length && { comments }) }) }),
  comment: (owner: string, repo: string, num: number, body: string, inReplyTo: number) =>
    gh(`/repos/${owner}/${repo}/pulls/${num}/comments`, { method: "POST", body: JSON.stringify({ body, in_reply_to: inReplyTo }) }),
};

// Repo operations
export const repos = {
  user: () => gh(`/user/repos?per_page=100&sort=updated`),
  org: (org: string) => gh(`/orgs/${org}/repos?per_page=100&sort=updated`),
};

// Legacy exports for compatibility
export const getPullRequest = pr.get;
export const getPullRequestDiff = pr.diff;
export const getCompareCommits = pr.compare;
export const getPullRequestCommits = pr.commits;
export const getPullRequestFiles = pr.files;
export const createReview = review.create;
export const createReviewComment = review.comment;
export const listUserRepos = repos.user;
export const listOrgRepos = repos.org;
export const listPullRequests = pr.list;
