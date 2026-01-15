"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AnalyticsData {
  summary: { totalReviews: number; totalIssues: number; totalCritical: number };
  byDate: Array<{ date: string; count: number; issues: number }>;
  byCategory: Array<{ category: string; count: number }>;
}

export default function AnalyticsChart() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [securityData, setSecurityData] = useState<Array<{ grade: string; count: number }>>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics?days=7").then(r => r.json()),
      fetch("/api/scans?limit=100").then(r => r.json()),
    ]).then(([analytics, scans]) => {
      setData(analytics);
      const grades: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      (scans.scans || []).forEach((s: any) => {
        const g = s.scan_metadata?.grade || (s.security_score >= 90 ? "A" : s.security_score >= 80 ? "B" : s.security_score >= 70 ? "C" : s.security_score >= 60 ? "D" : "F");
        grades[g]++;
      });
      setSecurityData(Object.entries(grades).map(([grade, count]) => ({ grade, count })));
    });
  }, []);

  const chartData = data?.byDate.slice(-7).map(d => ({
    day: new Date(d.date).toLocaleDateString("en", { weekday: "short" }),
    reviews: d.count,
    issues: d.issues,
  })) || [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-400">Reviews (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <XAxis dataKey="day" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
              <Line type="monotone" dataKey="reviews" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="issues" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-400">Security Grades</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={securityData}>
              <XAxis dataKey="grade" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
              <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
