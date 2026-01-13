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
  created_at: string;
  is_incremental: boolean;
}

interface RepoConfig {
  id: string;
  full_name: string;
  enabled: boolean;
  auto_review: boolean;
}

export default function DashboardPage() {
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickReview, setQuickReview] = useState({ owner: "", repo: "", pr: "" });
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/reviews?limit=5").then(r => r.json()),
      fetch("/api/repos/config").then(r => r.json()),
    ]).then(([reviews, repoData]) => {
      setRecentReviews(reviews.reviews || []);
      setRepos(repoData.configs || []);
    }).finally(() => setLoading(false));
  }, []);

  const runQuickReview = async () => {
    if (!quickReview.owner || !quickReview.repo || !quickReview.pr) return;
    setReviewing(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: quickReview.owner,
          repo: quickReview.repo,
          pr_number: parseInt(quickReview.pr),
          post: true,
        }),
      });
      if (res.ok) {
        const reviews = await fetch("/api/reviews?limit=5").then(r => r.json());
        setRecentReviews(reviews.reviews || []);
      }
    } finally {
      setReviewing(false);
    }
  };

  const getSeverityColor = (result: any) => {
    if (!result?.line_comments) return "bg-zinc-500";
    const critical = result.line_comments.filter((c: any) => c.severity === "critical").length;
    const high = result.line_comments.filter((c: any) => c.severity === "high").length;
    if (critical > 0) return "bg-red-500";
    if (high > 0) return "bg-orange-500";
    return "bg-emerald-500";
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-500">AI-powered code review overview</p>
      </div>

      {/* Quick Review */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <span>⚡</span> Quick Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              placeholder="owner"
              value={quickReview.owner}
              onChange={e => setQuickReview(p => ({ ...p, owner: e.target.value }))}
              className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
            />
            <input
              placeholder="repo"
              value={quickReview.repo}
              onChange={e => setQuickReview(p => ({ ...p, repo: e.target.value }))}
              className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
            />
            <input
              placeholder="PR #"
              value={quickReview.pr}
              onChange={e => setQuickReview(p => ({ ...p, pr: e.target.value }))}
              className="w-24 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
            />
            <Button onClick={runQuickReview} disabled={reviewing} className="bg-emerald-600 hover:bg-emerald-700">
              {reviewing ? "Reviewing..." : "Review"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Reviews */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Recent Reviews</CardTitle>
            <Link href="/dashboard/reviews" className="text-sm text-emerald-400 hover:underline">View all →</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentReviews.length === 0 ? (
              <p className="text-zinc-500 text-sm">No reviews yet</p>
            ) : (
              recentReviews.map((review) => (
                <Link
                  key={review.id}
                  href={`/dashboard/reviews/${review.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getSeverityColor(review.result)}`} />
                    <div>
                      <div className="text-sm font-medium text-white">{review.repo_full_name}</div>
                      <div className="text-xs text-zinc-500">PR #{review.pr_number}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className={review.status === "completed" ? "border-emerald-500 text-emerald-400" : "border-red-500 text-red-400"}>
                      {review.status}
                    </Badge>
                    <div className="text-xs text-zinc-500 mt-1">
                      {new Date(review.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Connected Repos */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Connected Repos</CardTitle>
            <Link href="/dashboard/repos" className="text-sm text-emerald-400 hover:underline">Manage →</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {repos.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-zinc-500 text-sm mb-3">No repos connected</p>
                <Link href="/dashboard/repos">
                  <Button variant="outline" size="sm">Connect Repository</Button>
                </Link>
              </div>
            ) : (
              repos.slice(0, 5).map((repo) => (
                <div key={repo.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📁</span>
                    <span className="text-sm text-white">{repo.full_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {repo.auto_review && <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Auto</Badge>}
                    <Badge variant="outline" className={repo.enabled ? "border-emerald-500 text-emerald-400" : "border-zinc-600 text-zinc-500"}>
                      {repo.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">{recentReviews.filter(r => r.status === "completed").length}</div>
            <div className="text-sm text-zinc-500">Completed Today</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-400">
              {recentReviews.reduce((acc, r) => acc + (r.result?.line_comments?.filter((c: any) => c.severity === "critical" || c.severity === "high").length || 0), 0)}
            </div>
            <div className="text-sm text-zinc-500">Critical Issues</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-400">{repos.filter(r => r.enabled).length}</div>
            <div className="text-sm text-zinc-500">Active Repos</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-white">Groq</div>
            <div className="text-sm text-zinc-500">LLM Provider</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
