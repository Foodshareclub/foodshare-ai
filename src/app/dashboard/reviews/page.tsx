"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Review {
  id: string;
  repo_full_name: string;
  pr_number: number;
  status: string;
  result: any;
  head_sha: string;
  is_incremental: boolean;
  created_at: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "completed" | "failed">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/reviews?limit=50")
      .then(r => r.json())
      .then(data => setReviews(data.reviews || []))
      .finally(() => setLoading(false));
  }, []);

  const filteredReviews = reviews.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (search && !r.repo_full_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getSeverityIndicator = (result: any) => {
    if (!result?.line_comments) return { color: "bg-zinc-500", count: 0 };
    const critical = result.line_comments.filter((c: any) => c.severity === "critical").length;
    const high = result.line_comments.filter((c: any) => c.severity === "high").length;
    const total = result.line_comments.length;
    if (critical > 0) return { color: "bg-red-500", count: total, label: `${critical} critical` };
    if (high > 0) return { color: "bg-orange-500", count: total, label: `${high} high` };
    if (total > 0) return { color: "bg-yellow-500", count: total, label: `${total} issues` };
    return { color: "bg-emerald-500", count: 0, label: "Clean" };
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Review History</h1>
          <p className="text-zinc-500">{reviews.length} total reviews</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <input
          type="text"
          placeholder="Search repos..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm w-64"
        />
        <div className="flex gap-1">
          {(["all", "completed", "failed"] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? "bg-emerald-600" : ""}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-3">
        {filteredReviews.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-12 text-center">
              <p className="text-zinc-500">No reviews found</p>
            </CardContent>
          </Card>
        ) : (
          filteredReviews.map(review => {
            const severity = getSeverityIndicator(review.result);
            return (
              <Link key={review.id} href={`/dashboard/reviews/${review.id}`}>
                <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${severity.color}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{review.repo_full_name}</span>
                            <span className="text-zinc-500">#{review.pr_number}</span>
                            {review.is_incremental && (
                              <Badge variant="outline" className="text-xs">Incremental</Badge>
                            )}
                          </div>
                          <div className="text-sm text-zinc-500">
                            {new Date(review.created_at).toLocaleString()} • {review.head_sha?.slice(0, 7)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm text-zinc-400">{severity.label}</div>
                          <Badge
                            variant="outline"
                            className={review.status === "completed" ? "border-emerald-500 text-emerald-400" : "border-red-500 text-red-400"}
                          >
                            {review.status}
                          </Badge>
                        </div>
                        <span className="text-zinc-600">→</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
