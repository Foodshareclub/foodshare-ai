import { NextRequest, NextResponse } from "next/server";
import { reviewAndPost } from "@/lib/review";
import { createClient } from "@/lib/supabase/server";
import { ReviewCategory } from "@/lib/review/models";

export async function POST(request: NextRequest) {
  try {
    const { owner, repo, pr_number } = await request.json();

    if (!owner || !repo || !pr_number) {
      return NextResponse.json({ error: "owner, repo, pr_number required" }, { status: 400 });
    }

    const fullName = `${owner}/${repo}`;
    const supabase = await createClient();

    const { data: config } = await supabase
      .from("repo_configs")
      .select("categories")
      .eq("full_name", fullName)
      .single();

    const categories = (config?.categories || ["security", "bug", "performance"]).map(
      (c: string) => c as ReviewCategory
    );

    const { review, headSha, isIncremental } = await reviewAndPost(owner, repo, pr_number, categories);

    await supabase.from("review_history").insert({
      repo_full_name: fullName,
      pr_number,
      status: "completed",
      result: JSON.stringify(review),
      head_sha: headSha,
      is_incremental: isIncremental,
    });

    return NextResponse.json({ success: true, review, isIncremental });
  } catch (error) {
    console.error("Manual review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review failed" },
      { status: 500 }
    );
  }
}
