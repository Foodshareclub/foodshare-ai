import { NextRequest } from "next/server";
import { reviewPullRequest, reviewAndPost } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";
import { ok, handleError, validate, v } from "@/lib/api";

interface ReviewInput {
  owner: string;
  repo: string;
  pr_number: number;
  post?: boolean;
  depth?: "quick" | "standard" | "deep";
  focus_areas?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const input = validate<ReviewInput>(body, {
      owner: v.slug,
      repo: v.slug,
      pr_number: v.posInt,
      post: v.optBool,
      depth: v.oneOf("quick", "standard", "deep"),
      focus_areas: v.optArray,
    });

    const { owner, repo, pr_number, post, depth, focus_areas } = input;
    const fullName = `${owner}/${repo}`;
    const options = depth || focus_areas ? { depth, focus_areas } : undefined;

    const supabase = await createClient();

    if (post) {
      const result = await reviewAndPost(owner, repo, pr_number, undefined, options);
      await supabase.from("review_history").insert({
        repo_full_name: fullName,
        pr_number,
        status: "completed",
        result: { ...result.review, _analysis: result.analysis },
        head_sha: result.headSha,
        is_incremental: result.isIncremental,
      });
      return ok(result);
    }

    const review = await reviewPullRequest(owner, repo, pr_number, undefined, undefined, undefined, options);
    await supabase.from("review_history").insert({
      repo_full_name: fullName,
      pr_number,
      status: "completed",
      result: review,
      head_sha: review.headSha,
      is_incremental: review.isIncremental,
    });
    return ok(review);
  } catch (error) {
    return handleError(error);
  }
}
