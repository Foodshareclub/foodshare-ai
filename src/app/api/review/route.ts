import { NextRequest, NextResponse } from "next/server";
import { reviewPullRequest, reviewAndPost } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";

const VALID_DEPTHS = ["quick", "standard", "deep"] as const;

function validateInput(body: unknown): { owner: string; repo: string; pr_number: number; post: boolean; depth?: "quick" | "standard" | "deep"; focus_areas?: string[] } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body" };
  const { owner, repo, pr_number, post, depth, focus_areas } = body as Record<string, unknown>;
  if (typeof owner !== "string" || !/^[\w.-]+$/.test(owner)) return { error: "Invalid owner" };
  if (typeof repo !== "string" || !/^[\w.-]+$/.test(repo)) return { error: "Invalid repo" };
  if (typeof pr_number !== "number" || pr_number < 1 || !Number.isInteger(pr_number)) return { error: "Invalid pr_number" };
  if (depth !== undefined && !VALID_DEPTHS.includes(depth as typeof VALID_DEPTHS[number])) return { error: "Invalid depth" };
  if (focus_areas !== undefined && (!Array.isArray(focus_areas) || !focus_areas.every((a) => typeof a === "string"))) return { error: "Invalid focus_areas" };
  return { owner, repo, pr_number, post: !!post, depth: depth as "quick" | "standard" | "deep" | undefined, focus_areas: focus_areas as string[] | undefined };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = validateInput(body);
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

    const { owner, repo, pr_number, post, depth, focus_areas } = input;
    const fullName = `${owner}/${repo}`;
    const options = depth || focus_areas ? { depth, focus_areas } : undefined;

    if (post) {
      const result = await reviewAndPost(owner, repo, pr_number, undefined, options);
      const supabase = await createClient();
      await supabase.from("review_history").insert({
        repo_full_name: fullName,
        pr_number,
        status: "completed",
        result: { ...result.review, _analysis: result.analysis },
        head_sha: result.headSha,
        is_incremental: result.isIncremental,
      });
      return NextResponse.json(result);
    }

    const review = await reviewPullRequest(owner, repo, pr_number, undefined, undefined, undefined, options);
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Review failed" }, { status: 500 });
  }
}
