"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Scan {
  id: string;
  repo_full_name: string;
  security_score: number;
  summary: string;
  issues: any[];
  files_scanned: number;
  scan_metadata: {
    grade?: string;
    threat_level?: string;
    by_type?: { security: number; bugs: number; quality: number };
    by_severity?: { critical: number; high: number; medium: number; low: number };
  };
  created_at: string;
}

export default function ScansPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scans?limit=50").then(r => r.json()).then(data => {
      setScans(data.scans || []);
      setLoading(false);
    });
  }, []);

  const triggerScan = async (repo?: string) => {
    setScanning(repo || "all");
    try {
      const url = repo 
        ? `https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos?repo=${repo}`
        : "https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos";
      await fetch(url, { headers: { Authorization: "Bearer foodshare-cron-2026" } });
      // Refresh
      const res = await fetch("/api/scans?limit=50");
      const data = await res.json();
      setScans(data.scans || []);
    } finally {
      setScanning(null);
    }
  };

  const gradeColor: Record<string, string> = {
    A: "bg-emerald-500", B: "bg-green-500", C: "bg-yellow-500", D: "bg-orange-500", F: "bg-red-500"
  };

  const threatColor: Record<string, string> = {
    SAFE: "text-emerald-400", LOW: "text-green-400", MEDIUM: "text-yellow-400", HIGH: "text-orange-400", CRITICAL: "text-red-400"
  };

  // Group by repo, show latest
  const latestByRepo = scans.reduce((acc, scan) => {
    if (!acc[scan.repo_full_name] || new Date(scan.created_at) > new Date(acc[scan.repo_full_name].created_at)) {
      acc[scan.repo_full_name] = scan;
    }
    return acc;
  }, {} as Record<string, Scan>);

  if (loading) return <div className="flex items-center justify-center h-64 text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Security Scans</h1>
          <p className="text-zinc-500">{Object.keys(latestByRepo).length} repos • {scans.length} total scans</p>
        </div>
        <Button onClick={() => triggerScan()} disabled={!!scanning} className="bg-emerald-600 hover:bg-emerald-700">
          {scanning === "all" ? "Scanning..." : "🔍 Scan All Repos"}
        </Button>
      </div>

      <div className="grid gap-4">
        {Object.values(latestByRepo).sort((a, b) => a.security_score - b.security_score).map(scan => {
          const grade = scan.scan_metadata?.grade || (scan.security_score >= 90 ? "A" : scan.security_score >= 80 ? "B" : scan.security_score >= 70 ? "C" : scan.security_score >= 60 ? "D" : "F");
          const threat = scan.scan_metadata?.threat_level || "MEDIUM";
          const isExpanded = expanded === scan.id;

          return (
            <Card key={scan.id} className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg ${gradeColor[grade] || "bg-zinc-500"} flex items-center justify-center text-white font-bold text-lg`}>
                      {grade}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{scan.repo_full_name}</span>
                        <Badge variant="outline" className={threatColor[threat]}>{threat}</Badge>
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">{scan.summary}</p>
                      <div className="flex gap-4 mt-2 text-xs text-zinc-600">
                        <span>Score: {scan.security_score}/100</span>
                        <span>Files: {scan.files_scanned}</span>
                        <span>{new Date(scan.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {scan.scan_metadata?.by_severity && (
                      <div className="flex gap-1 text-xs">
                        {scan.scan_metadata.by_severity.critical > 0 && <Badge className="bg-red-500">{scan.scan_metadata.by_severity.critical} crit</Badge>}
                        {scan.scan_metadata.by_severity.high > 0 && <Badge className="bg-orange-500">{scan.scan_metadata.by_severity.high} high</Badge>}
                        {scan.scan_metadata.by_severity.medium > 0 && <Badge className="bg-yellow-600">{scan.scan_metadata.by_severity.medium} med</Badge>}
                        {scan.scan_metadata.by_severity.low > 0 && <Badge className="bg-zinc-600">{scan.scan_metadata.by_severity.low} low</Badge>}
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setExpanded(isExpanded ? null : scan.id)}>
                      {isExpanded ? "Hide" : "Details"}
                    </Button>
                    <Button size="sm" onClick={() => triggerScan(scan.repo_full_name)} disabled={scanning === scan.repo_full_name} className="bg-blue-600">
                      {scanning === scan.repo_full_name ? "..." : "Rescan"}
                    </Button>
                  </div>
                </div>

                {isExpanded && scan.issues?.length > 0 && (
                  <div className="mt-4 border-t border-zinc-800 pt-4">
                    <h4 className="text-sm font-medium text-white mb-2">Issues Found ({scan.issues.length})</h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {scan.issues.map((issue: any, i: number) => (
                        <div key={i} className="bg-zinc-800 rounded p-3 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={issue.severity === "critical" ? "bg-red-500" : issue.severity === "high" ? "bg-orange-500" : issue.severity === "medium" ? "bg-yellow-600" : "bg-zinc-600"}>
                              {issue.severity}
                            </Badge>
                            <span className="text-zinc-400">{issue.type || issue.category}</span>
                            <span className="text-zinc-600">• {issue.file}:{issue.line}</span>
                          </div>
                          <p className="text-white">{issue.title || issue.problem}</p>
                          {issue.fix && <p className="text-emerald-400 text-xs mt-1">Fix: {issue.fix}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
