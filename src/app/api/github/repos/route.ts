import { NextResponse } from "next/server";

const GITHUB_API = "https://api.github.com";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
  };
}

export async function GET() {
  try {
    // Get user repos
    const userRes = await fetch(`${GITHUB_API}/user/repos?per_page=100&sort=updated`, {
      headers: getHeaders(),
    });
    const userRepos = userRes.ok ? await userRes.json() : [];

    // Get org repos (Foodshareclub)
    const orgRes = await fetch(`${GITHUB_API}/orgs/Foodshareclub/repos?per_page=100&sort=updated`, {
      headers: getHeaders(),
    });
    const orgRepos = orgRes.ok ? await orgRes.json() : [];

    const allRepos = [...userRepos, ...orgRepos]
      .filter((r: any) => !r.archived)
      .map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        name: r.name,
        owner: r.owner.login,
        private: r.private,
        updated_at: r.updated_at,
      }))
      .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    // Remove duplicates
    const unique = allRepos.filter((r: any, i: number, arr: any[]) => 
      arr.findIndex((x: any) => x.full_name === r.full_name) === i
    );

    return NextResponse.json({ repos: unique });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch repos" }, { status: 500 });
  }
}
