import { getJobStats } from "@/lib/queue";
import { createClient } from "@/lib/supabase/server";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const [stats, supabase] = await Promise.all([getJobStats(), createClient()]);
    const { data: recentFailed } = await supabase
      .from("review_jobs")
      .select("id, repo_full_name, pr_number, error, attempts, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5);

    return ok({ stats, recent_failed: recentFailed || [] });
  } catch (error) {
    return handleError(error);
  }
}
