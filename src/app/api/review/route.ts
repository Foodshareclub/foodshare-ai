import { NextRequest, NextResponse } from "next/server";
import { reviewPullRequest, reviewAndPost } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";

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

    const fullName = `${owner}/${repo}`;

    if (post) {
      const result = await reviewAndPost(owner, repo, pr_number);
      // Save to history
      const supabase = await createClient();
      await supabase.from("review_history").insert({
        repo_full_name: fullName,
        pr_number,
        status: "completed",
        result: result.review,
        head_sha: result.headSha,
        is_incremental: result.isIncremental,
      });
      return NextResponse.json(result);
    }

    const review = await reviewPullRequest(owner, repo, pr_number);
    // Save to history
    const supabase = await createClient();
    await supabase.from("review_history").insert({
      repo_full_name: fullName,
      pr_number,
      status: "completed",
      result: review,
      head_sha: review.headSha,
      is_incremental: review.isIncremental,
    });
    return NextResponse.json(review);
  } catch (error) {
    console.error("Review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review failed" },
      { status: 500 }
    );
  }
}
