"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testReview = async () => {
    setReviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: "Foodshareclub",
          repo: "supamigrate",
          pr_number: 47,
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-gray-500">AI-powered code review for your PRs</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Quick Review</CardTitle>
            <CardDescription>Test the review system</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={testReview} disabled={reviewing}>
              {reviewing ? "Reviewing..." : "Review Test PR"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LLM Provider</CardTitle>
            <CardDescription>Current configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">
              {process.env.NEXT_PUBLIC_LLM_PROVIDER || "groq"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>System health</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge className="bg-green-500">Online</Badge>
          </CardContent>
        </Card>
      </div>

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
            <CardTitle>Review Result</CardTitle>
            <Badge variant={result.approval_recommendation === "approve" ? "default" : "destructive"}>
              {result.approval_recommendation}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium">Overview</h4>
              <p className="text-gray-600">{result.summary?.overview}</p>
            </div>
            <div>
              <h4 className="font-medium">Risk Assessment</h4>
              <p className="text-gray-600">{result.summary?.risk_assessment}</p>
            </div>
            <div>
              <h4 className="font-medium">Recommendations</h4>
              <ul className="list-disc pl-4 text-gray-600">
                {result.summary?.recommendations?.map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            {result.line_comments?.length > 0 && (
              <div>
                <h4 className="font-medium">Issues Found ({result.line_comments.length})</h4>
                <div className="space-y-2 mt-2">
                  {result.line_comments.map((c: any, i: number) => (
                    <div key={i} className="p-2 bg-gray-50 rounded text-sm">
                      <Badge variant="outline" className="mr-2">{c.severity}</Badge>
                      <span className="font-mono text-xs">{c.path}:{c.line}</span>
                      <p className="mt-1 text-gray-600">{c.body}</p>
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
