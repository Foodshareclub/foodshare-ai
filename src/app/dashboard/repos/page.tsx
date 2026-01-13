"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  open_issues_count: number;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
}

export default function ReposPage() {
  const [orgInput, setOrgInput] = useState("Foodshareclub");
  const [org, setOrg] = useState("Foodshareclub");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [loadingPulls, setLoadingPulls] = useState(false);

  const fetchRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos?org=${org}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRepos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repos");
    } finally {
      setLoading(false);
    }
  };

  const fetchPulls = async (repo: Repo) => {
    setSelectedRepo(repo);
    setLoadingPulls(true);
    try {
      const [owner, repoName] = repo.full_name.split("/");
      const res = await fetch(`/api/pulls?owner=${owner}&repo=${repoName}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPulls(data);
    } catch (err) {
      console.error("Failed to fetch pulls:", err);
      setPulls([]);
    } finally {
      setLoadingPulls(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, [org]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Repositories</h2>
        <p className="text-gray-500">Browse and review pull requests</p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Organization name"
          value={orgInput}
          onChange={(e) => setOrgInput(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={() => setOrg(orgInput)} disabled={loading}>
          {loading ? "Loading..." : "Load Repos"}
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {repos.map((repo) => (
          <Card
            key={repo.id}
            className={`cursor-pointer transition-colors hover:border-blue-300 ${
              selectedRepo?.id === repo.id ? "border-blue-500" : ""
            }`}
            onClick={() => fetchPulls(repo)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{repo.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {repo.description || "No description"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {repo.language && (
                  <Badge variant="outline">{repo.language}</Badge>
                )}
                <Badge variant="secondary">{repo.open_issues_count} issues</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedRepo && (
        <Card>
          <CardHeader>
            <CardTitle>Pull Requests - {selectedRepo.name}</CardTitle>
            <CardDescription>
              {loadingPulls ? "Loading..." : `${pulls.length} open PRs`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pulls.length === 0 && !loadingPulls ? (
              <p className="text-gray-500">No open pull requests</p>
            ) : (
              <div className="space-y-2">
                {pulls.map((pr) => (
                  <div
                    key={pr.number}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                  >
                    <div>
                      <span className="font-medium">#{pr.number}</span>{" "}
                      <span>{pr.title}</span>
                      <p className="text-sm text-gray-500">
                        by {pr.user.login} • {new Date(pr.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <ReviewButton
                      owner={selectedRepo.full_name.split("/")[0]}
                      repo={selectedRepo.name}
                      prNumber={pr.number}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReviewButton({
  owner,
  repo,
  prNumber,
}: {
  owner: string;
  repo: string;
  prNumber: number;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [done, setDone] = useState(false);

  const handleReview = async () => {
    setReviewing(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, pr_number: prNumber }),
      });
      if (res.ok) {
        setDone(true);
      }
    } catch (err) {
      console.error("Review failed:", err);
    } finally {
      setReviewing(false);
    }
  };

  if (done) {
    return <Badge className="bg-green-500">Reviewed</Badge>;
  }

  return (
    <Button size="sm" onClick={handleReview} disabled={reviewing}>
      {reviewing ? "Reviewing..." : "Review"}
    </Button>
  );
}
