import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, handleError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const days = Math.min(parseInt(new URL(request.url).searchParams.get("days") || "30"), 365);
    const supabase = await createClient();
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: reviews, error } = await supabase
      .from("review_history")
      .select("repo_full_name,created_at,result")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!reviews) return ok({ summary: {}, byDate: [], byRepo: [], byCategory: [] });

    const byDate: Record<string, { count: number; issues: number; critical: number }> = {};
    const byRepo: Record<string, { count: number; issues: number }> = {};
    const byCategory: Record<string, number> = {};
    let totalIssues = 0, totalCritical = 0, totalHigh = 0;

    for (const r of reviews) {
      const date = r.created_at.split("T")[0];
      const issues = r.result?.line_comments || [];
      const critical = issues.filter((c: any) => c.severity === "critical").length;
      const high = issues.filter((c: any) => c.severity === "high").length;

      byDate[date] = byDate[date] || { count: 0, issues: 0, critical: 0 };
      byDate[date]!.count++;
      byDate[date]!.issues += issues.length;
      byDate[date]!.critical += critical;

      byRepo[r.repo_full_name] = byRepo[r.repo_full_name] || { count: 0, issues: 0 };
      byRepo[r.repo_full_name]!.count++;
      byRepo[r.repo_full_name]!.issues += issues.length;

      for (const c of issues) byCategory[c.category] = (byCategory[c.category] || 0) + 1;
      totalIssues += issues.length;
      totalCritical += critical;
      totalHigh += high;
    }

    return ok({
      summary: { totalReviews: reviews.length, totalIssues, totalCritical, totalHigh, avgIssuesPerReview: reviews.length ? +(totalIssues / reviews.length).toFixed(1) : 0 },
      byDate: Object.entries(byDate).map(([date, d]) => ({ date, ...d })),
      byRepo: Object.entries(byRepo).map(([repo, d]) => ({ repo, ...d })).sort((a, b) => b.count - a.count),
      byCategory: Object.entries(byCategory).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    return handleError(error);
  }
}
