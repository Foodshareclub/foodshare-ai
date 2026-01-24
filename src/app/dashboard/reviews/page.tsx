"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface LineComment {
  severity: "critical" | "high" | "medium" | "low" | "info";
  body: string;
  path: string;
  line: number;
}

interface ReviewResult {
  summary?: {
    overview: string;
    changes_description: string;
    risk_assessment: string;
    recommendations: string[];
  };
  line_comments?: LineComment[];
  approval_recommendation?: "approve" | "request_changes" | "comment";
}

interface Review {
  id: string;
  repo_full_name: string;
  pr_number: number;
  status: string;
  result: ReviewResult | null;
  head_sha: string;
  is_incremental: boolean;
  created_at: string;
}

interface PR {
  number: number;
  title: string;
  user: { login: string };
  created_at: string;
  additions: number;
  deletions: number;
  repo: string;
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [openPRs, setOpenPRs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPRs, setLoadingPRs] = useState(false);
  const [filter, setFilter] = useState<"all" | "completed" | "failed">("all");
  const [repoFilter, setRepoFilter] = useState("");
  const [tab, setTab] = useState<"reviews" | "pending">("reviews");
  const [reviewing, setReviewing] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/reviews?limit=100").then(r => r.json()),
      fetch("/api/repos/config").then(r => r.json()),
    ]).then(async ([reviewData, repoData]) => {
      setReviews(reviewData.reviews || []);
      
      // Fetch open PRs from enabled repos
      const enabledRepos = (repoData.configs || []).filter((c: any) => c.enabled);
      if (enabledRepos.length > 0) {
        setLoadingPRs(true);
        const prs: PR[] = [];
        for (const repo of enabledRepos.slice(0, 5)) { // Limit to 5 repos
          const [owner, repoName] = repo.full_name.split("/");
          try {
            const res = await fetch(`/api/pulls?owner=${owner}&repo=${repoName}`);
            const data = await res.json();
            (data.pulls || []).forEach((pr: any) => prs.push({ ...pr, repo: repo.full_name }));
          } catch {}
        }
        setOpenPRs(prs);
        setLoadingPRs(false);
      }
    }).finally(() => setLoading(false));
  }, []);

  const reviewedPRs = new Set(reviews.map(r => `${r.repo_full_name}#${r.pr_number}`));
  const pendingPRs = openPRs.filter(pr => !reviewedPRs.has(`${pr.repo}#${pr.number}`));

  const triggerReview = async (pr: PR) => {
    setReviewing(pr.number);
    const [owner, repo] = pr.repo.split("/");
    try {
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, pr_number: pr.number, post: true }),
      });
      // Refresh reviews
      const res = await fetch("/api/reviews?limit=100");
      const data = await res.json();
      setReviews(data.reviews || []);
    } finally {
      setReviewing(null);
    }
  };

  const deleteReview = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this review?")) return;
    await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    setReviews(reviews.filter(r => r.id !== id));
  };

  const repos = [...new Set(reviews.map(r => r.repo_full_name))];

  const filteredReviews = reviews
    .filter(r => {
      if (filter !== "all" && r.status !== filter) return false;
      if (repoFilter && r.repo_full_name !== repoFilter) return false;
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const getSeverityIndicator = (result: ReviewResult | null) => {
    if (!result?.line_comments) return { color: "bg-zinc-500", label: "No data" };
    const critical = result.line_comments.filter((c) => c.severity === "critical").length;
    const high = result.line_comments.filter((c) => c.severity === "high").length;
    const total = result.line_comments.length;
    if (critical > 0) return { color: "bg-red-500", label: `${critical} critical` };
    if (high > 0) return { color: "bg-orange-500", label: `${high} high` };
    if (total > 0) return { color: "bg-yellow-500", label: `${total} issues` };
    return { color: "bg-emerald-500", label: "Clean ✓" };
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reviews</h1>
          <p className="text-zinc-500">{reviews.length} reviews • {pendingPRs.length} pending PRs</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tab === "reviews" ? "default" : "outline"}
            onClick={() => setTab("reviews")}
            className={tab === "reviews" ? "bg-emerald-600" : ""}
          >
            📋 Reviews ({filteredReviews.length})
          </Button>
          <Button
            variant={tab === "pending" ? "default" : "outline"}
            onClick={() => setTab("pending")}
            className={tab === "pending" ? "bg-blue-600" : ""}
          >
            ⏳ Pending ({pendingPRs.length})
          </Button>
        </div>
      </div>

      {tab === "pending" ? (
        <div className="space-y-3">
          {loadingPRs ? (
            <p className="text-zinc-500">Loading open PRs...</p>
          ) : pendingPRs.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center">
                <p className="text-zinc-500">No pending PRs to review</p>
                <p className="text-zinc-600 text-sm mt-2">Enable repos in Settings to see their PRs here</p>
              </CardContent>
            </Card>
          ) : (
            pendingPRs.map(pr => (
              <Card key={`${pr.repo}#${pr.number}`} className="bg-zinc-900 border-zinc-800">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{pr.repo}</span>
                        <span className="text-zinc-500">#{pr.number}</span>
                        <Badge variant="outline" className="text-xs">
                          +{pr.additions} -{pr.deletions}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-400 mt-1 truncate max-w-lg">{pr.title}</p>
                      <p className="text-xs text-zinc-600 mt-1">
                        by {pr.user?.login} • {new Date(pr.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      onClick={() => triggerReview(pr)}
                      disabled={reviewing === pr.number}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {reviewing === pr.number ? "Reviewing..." : "🔍 Review"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={repoFilter}
              onChange={e => setRepoFilter(e.target.value)}
              className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
            >
              <option value="">All repos</option>
              {repos.map(repo => (
                <option key={repo} value={repo}>{repo}</option>
              ))}
            </select>
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
                    <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer group">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-3 h-3 rounded-full ${severity.color}`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-white">{review.repo_full_name}</span>
                                <span className="text-zinc-500">#{review.pr_number}</span>
                                {review.is_incremental && (
                                  <Badge variant="outline" className="text-xs text-blue-400 border-blue-400">Incremental</Badge>
                                )}
                              </div>
                              <div className="text-sm text-zinc-500">
                                {new Date(review.created_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-zinc-400">{severity.label}</span>
                            <button
                              onClick={(e) => deleteReview(review.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-2"
                            >
                              🗑️
                            </button>
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
        </>
      )}
    </div>
  );
}
