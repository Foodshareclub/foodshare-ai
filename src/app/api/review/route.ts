import { NextRequest, NextResponse } from "next/server";
import { reviewPullRequest, reviewAndPost } from "@/lib/review";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo, pr_number, post = false } = body;

    if (!owner || !repo || !pr_number) {
      return NextResponse.json(
        { error: "Missing required fields: owner, repo, pr_number" },
        { status: 400 }
      );
    }

    if (post) {
      const result = await reviewAndPost(owner, repo, pr_number);
      return NextResponse.json(result);
    }

    const review = await reviewPullRequest(owner, repo, pr_number);
    return NextResponse.json(review);
  } catch (error) {
    console.error("Review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review failed" },
      { status: 500 }
    );
  }
}
