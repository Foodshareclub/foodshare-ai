const GITHUB_API = "https://api.github.com";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function getPullRequest(owner: string, repo: string, prNumber: number) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  return res.json();
}

export async function getPullRequestDiff(owner: string, repo: string, prNumber: number) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`, {
    headers: { ...getHeaders(), Accept: "application/vnd.github.v3.diff" },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  return res.text();
}

export async function getPullRequestFiles(owner: string, repo: string, prNumber: number) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/files`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  return res.json();
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

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  return res.json();
}

export async function listUserRepos() {
  const res = await fetch(`${GITHUB_API}/user/repos?per_page=100&sort=updated`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  return res.json();
}

export async function listOrgRepos(org: string) {
  const res = await fetch(`${GITHUB_API}/orgs/${org}/repos?per_page=100&sort=updated`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  return res.json();
}

export async function listPullRequests(owner: string, repo: string, state: "open" | "closed" | "all" = "open") {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
  return res.json();
}
