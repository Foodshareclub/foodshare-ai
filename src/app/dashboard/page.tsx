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

interface PR {
  number: number;
  title: string;
  state: string;
}

export default function DashboardPage() {
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [prs, setPrs] = useState<PR[]>([]);
  const [selectedPr, setSelectedPr] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [postToGithub, setPostToGithub] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/reviews?limit=5").then(r => r.json()),
      fetch("/api/repos/config").then(r => r.json()),
    ]).then(([reviews, repoData]) => {
      setRecentReviews(reviews.reviews || []);
      setRepos(repoData.configs || []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedRepo) { setPrs([]); return; }
    setLoadingPrs(true);
    const [owner, repo] = selectedRepo.split("/");
    fetch(`/api/pulls?owner=${owner}&repo=${repo}`)
      .then(r => r.json())
      .then(data => setPrs(data.pulls || []))
      .finally(() => setLoadingPrs(false));
  }, [selectedRepo]);

  const runReview = async () => {
    if (!selectedRepo || !selectedPr) return;
    setReviewing(true);
    const [owner, repo] = selectedRepo.split("/");
    try {
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, pr_number: parseInt(selectedPr), post: postToGithub }),
      });
      const reviews = await fetch("/api/reviews?limit=5").then(r => r.json());
      setRecentReviews(reviews.reviews || []);
      setSelectedPr("");
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

  const getIssueCount = (result: any) => result?.line_comments?.length || 0;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading...</div>;
  }

  const totalIssues = recentReviews.reduce((acc, r) => acc + getIssueCount(r.result), 0);
  const criticalIssues = recentReviews.reduce((acc, r) => 
    acc + (r.result?.line_comments?.filter((c: any) => c.severity === "critical" || c.severity === "high").length || 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-zinc-500">AI-powered code review for your pull requests</p>
      </div>

      {/* Quick Review */}
      <Card className="bg-gradient-to-r from-emerald-900/20 to-zinc-900 border-emerald-800/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <span>⚡</span> Quick Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Repository</label>
              <select
                value={selectedRepo}
                onChange={e => { setSelectedRepo(e.target.value); setSelectedPr(""); }}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
              >
                <option value="">Select repository...</option>
                {repos.filter(r => r.enabled).map(repo => (
                  <option key={repo.id} value={repo.full_name}>{repo.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-zinc-400 block mb-1">Pull Request</label>
              <select
                value={selectedPr}
                onChange={e => setSelectedPr(e.target.value)}
                disabled={!selectedRepo || loadingPrs}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white disabled:opacity-50"
              >
                <option value="">{loadingPrs ? "Loading PRs..." : "Select PR..."}</option>
                {prs.map(pr => (
                  <option key={pr.number} value={pr.number}>#{pr.number} - {pr.title.slice(0, 50)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={postToGithub}
                onChange={e => setPostToGithub(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700"
              />
              Post review to GitHub
            </label>
            <Button 
              onClick={runReview} 
              disabled={reviewing || !selectedRepo || !selectedPr}
              className="bg-emerald-600 hover:bg-emerald-700 px-8"
            >
              {reviewing ? "Reviewing..." : "🔍 Start Review"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-white">{recentReviews.length}</div>
            <div className="text-sm text-zinc-500">Recent Reviews</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-yellow-400">{totalIssues}</div>
            <div className="text-sm text-zinc-500">Issues Found</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-red-400">{criticalIssues}</div>
            <div className="text-sm text-zinc-500">Critical/High</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-emerald-400">{repos.filter(r => r.enabled).length}</div>
            <div className="text-sm text-zinc-500">Active Repos</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Reviews */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Recent Reviews</CardTitle>
            <Link href="/dashboard/reviews" className="text-sm text-emerald-400 hover:underline">View all →</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentReviews.length === 0 ? (
              <p className="text-zinc-500 text-sm py-4 text-center">No reviews yet. Run your first review above!</p>
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
                      <div className="text-xs text-zinc-500">PR #{review.pr_number} • {getIssueCount(review.result)} issues</div>
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
                    <div className={`w-2 h-2 rounded-full ${repo.enabled ? "bg-emerald-500" : "bg-zinc-600"}`} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
