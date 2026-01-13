"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Review {
  id: string;
  repo_full_name: string;
  pr_number: number;
  status: string;
  result: {
    summary: {
      overview: string;
      changes_description: string;
      risk_assessment: string;
      recommendations: string[];
      praise: string[];
    };
    walkthrough: Array<{ path: string; summary: string; changes: string[] }>;
    line_comments: Array<{
      path: string;
      line: number;
      body: string;
      severity: string;
      category: string;
      suggestion?: string;
    }>;
    approval_recommendation: string;
  };
  head_sha: string;
  is_incremental: boolean;
  created_at: string;
}

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "issues" | "files">("summary");

  useEffect(() => {
    fetch(`/api/reviews/${params.id}`)
      .then(r => r.json())
      .then(data => setReview(data.review))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading...</div>;
  }

  if (!review) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 mb-4">Review not found</p>
        <Button onClick={() => router.push("/dashboard/reviews")}>Back to Reviews</Button>
      </div>
    );
  }

  const result = review.result;
  const severityColors: Record<string, string> = {
    critical: "bg-red-500 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-yellow-500 text-black",
    low: "bg-blue-500 text-white",
    info: "bg-zinc-500 text-white",
  };

  const categoryIcons: Record<string, string> = {
    security: "🔒",
    bug: "🐛",
    performance: "⚡",
    best_practices: "✨",
    other: "📝",
  };

  const criticalCount = result?.line_comments?.filter(c => c.severity === "critical").length || 0;
  const highCount = result?.line_comments?.filter(c => c.severity === "high").length || 0;
  const mediumCount = result?.line_comments?.filter(c => c.severity === "medium").length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-zinc-500 mb-2">
            <Link href="/dashboard/reviews" className="hover:text-white">Reviews</Link>
            <span>/</span>
            <span>{review.repo_full_name}</span>
          </div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            PR #{review.pr_number}
            <Badge className={review.status === "completed" ? "bg-emerald-500" : "bg-red-500"}>
              {review.status}
            </Badge>
            {review.is_incremental && <Badge variant="outline">Incremental</Badge>}
          </h1>
          <p className="text-zinc-500 mt-1">
            Reviewed {new Date(review.created_at).toLocaleString()} • {review.head_sha?.slice(0, 7)}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`https://github.com/${review.repo_full_name}/pull/${review.pr_number}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">View on GitHub →</Button>
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-400">{criticalCount}</div>
            <div className="text-sm text-zinc-500">Critical</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-orange-400">{highCount}</div>
            <div className="text-sm text-zinc-500">High</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-yellow-400">{mediumCount}</div>
            <div className="text-sm text-zinc-500">Medium</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-white capitalize">{result?.approval_recommendation || "N/A"}</div>
            <div className="text-sm text-zinc-500">Recommendation</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {(["summary", "issues", "files"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "text-emerald-400 border-b-2 border-emerald-400"
                : "text-zinc-500 hover:text-white"
            }`}
          >
            {tab === "summary" && "Summary"}
            {tab === "issues" && `Issues (${result?.line_comments?.length || 0})`}
            {tab === "files" && `Files (${result?.walkthrough?.length || 0})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-zinc-300">{result?.summary?.overview}</p>
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-1">Changes</h4>
                <p className="text-zinc-300">{result?.summary?.changes_description}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-1">Risk Assessment</h4>
                <Badge variant="outline" className="text-yellow-400 border-yellow-400">
                  {result?.summary?.risk_assessment}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {result?.summary?.praise?.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800 border-l-4 border-l-emerald-500">
              <CardHeader>
                <CardTitle className="text-emerald-400">✨ What&apos;s Good</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.summary.praise.map((p, i) => (
                    <li key={i} className="text-zinc-300 flex items-start gap-2">
                      <span className="text-emerald-400">•</span> {p}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result?.summary?.recommendations?.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">📋 Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {result.summary.recommendations.map((r, i) => (
                    <li key={i} className="text-zinc-300 flex items-start gap-2">
                      <span className="text-zinc-500">{i + 1}.</span> {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "issues" && (
        <div className="space-y-4">
          {!result?.line_comments?.length ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center">
                <p className="text-zinc-500">No issues found 🎉</p>
              </CardContent>
            </Card>
          ) : (
            result.line_comments.map((comment, i) => (
              <Card key={i} className="bg-zinc-900 border-zinc-800">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge className={severityColors[comment.severity] || severityColors.info}>
                        {comment.severity}
                      </Badge>
                      <span className="text-lg">{categoryIcons[comment.category] || "📝"}</span>
                      <span className="text-sm text-zinc-500">{comment.category}</span>
                    </div>
                    <code className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-400">
                      {comment.path}:{comment.line}
                    </code>
                  </div>
                  <p className="text-zinc-300 mb-3">{comment.body}</p>
                  {comment.suggestion && (
                    <div className="mt-3 p-3 bg-zinc-800 rounded-lg border-l-4 border-emerald-500">
                      <div className="text-xs text-emerald-400 mb-1">💡 Suggestion</div>
                      <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono">{comment.suggestion}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "files" && (
        <div className="space-y-4">
          {!result?.walkthrough?.length ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center">
                <p className="text-zinc-500">No file walkthrough available</p>
              </CardContent>
            </Card>
          ) : (
            result.walkthrough.map((file, i) => (
              <Card key={i} className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-white font-mono text-sm">{file.path}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-zinc-400 mb-2">{file.summary}</p>
                  {file.changes?.length > 0 && (
                    <ul className="space-y-1">
                      {file.changes.map((change, j) => (
                        <li key={j} className="text-sm text-zinc-500 flex items-start gap-2">
                          <span>•</span> {typeof change === "string" ? change : JSON.stringify(change)}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
