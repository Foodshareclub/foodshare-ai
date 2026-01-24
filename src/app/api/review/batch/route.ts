import { NextRequest, NextResponse } from "next/server";
import { reviewPullRequest } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";
import type { BatchReviewResult } from "@/types/github";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reviews } = body; // Array of { owner, repo, pr_number }

    if (!reviews?.length) {
      return NextResponse.json({ error: "No reviews provided" }, { status: 400 });
    }

    if (reviews.length > 5) {
      return NextResponse.json({ error: "Max 5 reviews per batch" }, { status: 400 });
    }

    const results = await Promise.allSettled(
      reviews.map(async (r: { owner: string; repo: string; pr_number: number }) => {
        const review = await reviewPullRequest(r.owner, r.repo, r.pr_number);
        const supabase = await createClient();
        await supabase.from("review_history").insert({
          repo_full_name: `${r.owner}/${r.repo}`,
          pr_number: r.pr_number,
          status: "completed",
          result: review,
          head_sha: review.headSha,
          is_incremental: review.isIncremental,
        });
        return { ...r, success: true, issues: review.line_comments?.length || 0 };
      })
    );

    const completed = results
      .filter((r): r is PromiseFulfilledResult<BatchReviewResult> => r.status === "fulfilled")
      .map(r => r.value);
    const failed = results.filter(r => r.status === "rejected").length;

    return NextResponse.json({ completed, failed, total: reviews.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Batch failed" }, { status: 500 });
  }
}
