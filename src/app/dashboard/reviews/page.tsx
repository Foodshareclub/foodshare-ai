"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface ReviewResult {
  summary: {
    overview: string;
    changes_description: string;
    risk_assessment: string;
    recommendations: string[];
  };
  line_comments: Array<{
    path: string;
    line: number;
    body: string;
    severity: string;
    category: string;
  }>;
  approval_recommendation: string;
}

export default function ReviewsPage() {
  const [owner, setOwner] = useState("Foodshareclub");
  const [repo, setRepo] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postToGithub, setPostToGithub] = useState(false);

  const handleReview = async () => {
    if (!owner || !repo || !prNumber) {
      setError("Please fill in all fields");
      return;
    }

    setReviewing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          pr_number: parseInt(prNumber),
          post: postToGithub,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Manual Review</h2>
        <p className="text-gray-500">Trigger an AI code review for any PR</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Review a Pull Request</CardTitle>
          <CardDescription>
            Enter the repository details and PR number
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Owner/Org</label>
              <Input
                placeholder="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Repository</label>
              <Input
                placeholder="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">PR Number</label>
              <Input
                placeholder="123"
                type="number"
                value={prNumber}
                onChange={(e) => setPrNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="postToGithub"
              checked={postToGithub}
              onChange={(e) => setPostToGithub(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="postToGithub" className="text-sm">
              Post review comments to GitHub
            </label>
          </div>
          <Button onClick={handleReview} disabled={reviewing}>
            {reviewing ? "Reviewing..." : "Start Review"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Review Result</CardTitle>
              <Badge
                variant={
                  result.approval_recommendation === "approve"
                    ? "default"
                    : "destructive"
                }
              >
                {result.approval_recommendation}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-medium mb-2">Overview</h4>
              <p className="text-gray-600">{result.summary?.overview}</p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Changes Description</h4>
              <p className="text-gray-600">{result.summary?.changes_description}</p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Risk Assessment</h4>
              <p className="text-gray-600">{result.summary?.risk_assessment}</p>
            </div>

            {result.summary?.recommendations?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Recommendations</h4>
                <ul className="list-disc pl-4 text-gray-600 space-y-1">
                  {result.summary.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.line_comments?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">
                  Issues Found ({result.line_comments.length})
                </h4>
                <div className="space-y-3">
                  {result.line_comments.map((comment, i) => (
                    <div
                      key={i}
                      className="p-3 bg-gray-50 rounded-md border-l-4"
                      style={{
                        borderLeftColor:
                          comment.severity === "high"
                            ? "#ef4444"
                            : comment.severity === "medium"
                            ? "#eab308"
                            : "#3b82f6",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getSeverityColor(comment.severity)}>
                          {comment.severity}
                        </Badge>
                        <Badge variant="outline">{comment.category}</Badge>
                        <span className="font-mono text-xs text-gray-500">
                          {comment.path}:{comment.line}
                        </span>
                      </div>
                      <p className="text-gray-700">{comment.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
