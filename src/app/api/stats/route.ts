import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  
  const [reviewsResult, reposResult] = await Promise.all([
    supabase.from("review_history").select("id", { count: "exact" }),
    supabase.from("repo_configs").select("id", { count: "exact" }),
  ]);

  return NextResponse.json({
    reviews: reviewsResult.count || 0,
    repos: reposResult.count || 0,
  });
}
