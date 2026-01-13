import { NextRequest, NextResponse } from "next/server";
import { listUserRepos, listOrgRepos } from "@/lib/github";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get("org");

    const repos = org ? await listOrgRepos(org) : await listUserRepos();

    return NextResponse.json(repos);
  } catch (error) {
    console.error("Repos error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch repos" },
      { status: 500 }
    );
  }
}
