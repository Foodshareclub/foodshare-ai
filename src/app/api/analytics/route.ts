import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30");
  
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: reviews } = await supabase
    .from("review_history")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (!reviews) return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });

  // Aggregate stats
  const byDate: Record<string, { count: number; issues: number; critical: number }> = {};
  const byRepo: Record<string, { count: number; issues: number }> = {};
  const byCategory: Record<string, number> = {};
  let totalIssues = 0, totalCritical = 0, totalHigh = 0;

  reviews.forEach(r => {
    const date = r.created_at.split("T")[0];
    const issues = r.result?.line_comments || [];
    const critical = issues.filter((c: any) => c.severity === "critical").length;
    const high = issues.filter((c: any) => c.severity === "high").length;

    byDate[date] = byDate[date] || { count: 0, issues: 0, critical: 0 };
    byDate[date].count++;
    byDate[date].issues += issues.length;
    byDate[date].critical += critical;

    byRepo[r.repo_full_name] = byRepo[r.repo_full_name] || { count: 0, issues: 0 };
    byRepo[r.repo_full_name].count++;
    byRepo[r.repo_full_name].issues += issues.length;

    issues.forEach((c: any) => {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    });

    totalIssues += issues.length;
    totalCritical += critical;
    totalHigh += high;
  });

  return NextResponse.json({
    summary: {
      totalReviews: reviews.length,
      totalIssues,
      totalCritical,
      totalHigh,
      avgIssuesPerReview: reviews.length ? (totalIssues / reviews.length).toFixed(1) : 0,
    },
    byDate: Object.entries(byDate).map(([date, data]) => ({ date, ...data })),
    byRepo: Object.entries(byRepo).map(([repo, data]) => ({ repo, ...data })).sort((a, b) => b.count - a.count),
    byCategory: Object.entries(byCategory).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
  });
}
