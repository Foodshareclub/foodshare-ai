import { NextRequest, NextResponse } from "next/server";
import { listPullRequests } from "@/lib/github";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const state = (searchParams.get("state") || "open") as "open" | "closed" | "all";

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "Missing required params: owner, repo" },
        { status: 400 }
      );
    }

    const pulls = await listPullRequests(owner, repo, state);
    return NextResponse.json(pulls);
  } catch (error) {
    console.error("Pulls error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch PRs" },
      { status: 500 }
    );
  }
}
