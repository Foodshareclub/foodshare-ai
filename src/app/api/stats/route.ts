import { createClient } from "@/lib/supabase/server";
import { ok, handleError } from "@/lib/api";

export const revalidate = 60; // Cache for 60 seconds

export async function GET() {
  try {
    const supabase = await createClient();
    const [reviews, repos, scans, queue] = await Promise.all([
      supabase.from("review_history").select("id, status", { count: "exact" }),
      supabase.from("repo_configs").select("id", { count: "exact" }).eq("enabled", true),
      supabase.from("security_scans").select("security_score, scan_metadata", { count: "exact" }),
      supabase.from("review_queue").select("id, status", { count: "exact" }),
    ]);

    const scanData = scans.data || [];
    const avgScore = scanData.length ? Math.round(scanData.reduce((a, s) => a + (s.security_score || 0), 0) / scanData.length) : 0;
    const criticalCount = scanData.reduce((a, s) => a + (s.scan_metadata?.by_severity?.critical || 0), 0);

    const queueData = queue.data || [];
    const pending = queueData.filter(j => j.status === "pending").length;
    const processing = queueData.filter(j => j.status === "processing").length;

    return ok({
      reviews: reviews.count || 0,
      repos: repos.count || 0,
      scans: { total: scans.count || 0, avgScore, criticalCount },
      queue: { pending, processing },
    });
  } catch (error) {
    return handleError(error);
  }
}
