"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Analytics {
  summary: {
    totalReviews: number;
    totalIssues: number;
    totalCritical: number;
    totalHigh: number;
    avgIssuesPerReview: string;
  };
  byDate: Array<{ date: string; count: number; issues: number; critical: number }>;
  byRepo: Array<{ repo: string; count: number; issues: number }>;
  byCategory: Array<{ category: string; count: number }>;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics?days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return <div className="text-zinc-500">Failed to load analytics</div>;

  const maxIssues = Math.max(...data.byDate.map(d => d.issues), 1);
  const categoryColors: Record<string, string> = {
    security: "bg-red-500",
    bug: "bg-orange-500",
    performance: "bg-yellow-500",
    best_practices: "bg-emerald-500",
    other: "bg-zinc-500",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-zinc-500">Code review insights and trends</p>
        </div>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value))}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-white">{data.summary.totalReviews}</div>
            <div className="text-sm text-zinc-500">Reviews</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-yellow-400">{data.summary.totalIssues}</div>
            <div className="text-sm text-zinc-500">Issues</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-400">{data.summary.totalCritical}</div>
            <div className="text-sm text-zinc-500">Critical</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-orange-400">{data.summary.totalHigh}</div>
            <div className="text-sm text-zinc-500">High</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-emerald-400">{data.summary.avgIssuesPerReview}</div>
            <div className="text-sm text-zinc-500">Avg/Review</div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Review Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byDate.length === 0 ? (
            <p className="text-zinc-500 text-center py-8">No data for this period</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {data.byDate.slice(-30).map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className="w-full bg-emerald-500/80 rounded-t transition-all hover:bg-emerald-400"
                    style={{ height: `${(d.issues / maxIssues) * 100}%`, minHeight: d.issues > 0 ? "4px" : "0" }}
                  />
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-zinc-800 text-white text-xs p-2 rounded shadow-lg whitespace-nowrap z-10">
                    {d.date}<br />
                    {d.count} reviews, {d.issues} issues
                    {d.critical > 0 && <span className="text-red-400"> ({d.critical} critical)</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* By Repository */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">By Repository</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.byRepo.length === 0 ? (
              <p className="text-zinc-500">No data</p>
            ) : (
              data.byRepo.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-zinc-500">{i + 1}.</span>
                    <span className="text-white truncate">{r.repo.split("/")[1]}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-zinc-400">{r.count} reviews</span>
                    <Badge variant="outline" className="text-yellow-400 border-yellow-400">{r.issues} issues</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* By Category */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Issues by Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.byCategory.length === 0 ? (
              <p className="text-zinc-500">No data</p>
            ) : (
              data.byCategory.map((c, i) => {
                const total = data.summary.totalIssues || 1;
                const pct = ((c.count / total) * 100).toFixed(0);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white capitalize">{c.category.replace("_", " ")}</span>
                      <span className="text-zinc-400">{c.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${categoryColors[c.category] || "bg-zinc-500"} rounded-full`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
