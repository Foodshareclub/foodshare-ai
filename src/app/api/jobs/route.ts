import { NextResponse } from "next/server";
import { getJobStats } from "@/lib/queue";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const [stats, supabase] = await Promise.all([
      getJobStats(),
      createClient(),
    ]);

    // Get recent failed jobs
    const { data: recentFailed } = await supabase
      .from("review_jobs")
      .select("id, repo_full_name, pr_number, error, attempts, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5);

    return NextResponse.json({ stats, recent_failed: recentFailed || [] });
  } catch (error) {
    return NextResponse.json({ error: "Failed to get job stats" }, { status: 500 });
  }
}
