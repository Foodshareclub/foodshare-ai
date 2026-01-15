"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

const LIMIT = 20;

export default function ScansPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [total, setTotal] = useState(0);
  const [totalRepos, setTotalRepos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [scanning, setScanning] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filteredScans = useMemo(() => {
    return scans.filter(scan => {
      const repoMatch = repoFilter === "all" || scan.repo_full_name === repoFilter;
      const severityMatch = severityFilter === "all" || 
        (scan.scan_metadata?.by_severity && scan.scan_metadata.by_severity[severityFilter as keyof typeof scan.scan_metadata.by_severity] > 0);
      return repoMatch && severityMatch;
    });
  }, [scans, repoFilter, severityFilter]);

  const stats = useMemo(() => {
    const totalIssues = filteredScans.reduce((sum, scan) => sum + (scan.issues?.length || 0), 0);
    const avgScore = filteredScans.length ? Math.round(filteredScans.reduce((sum, scan) => sum + scan.security_score, 0) / filteredScans.length) : 0;
    const criticalCount = filteredScans.reduce((sum, scan) => sum + (scan.scan_metadata?.by_severity?.critical || 0), 0);
    return { totalIssues, avgScore, criticalCount };
  }, [filteredScans]);

  const uniqueRepos = useMemo(() => [...new Set(scans.map(s => s.repo_full_name))], [scans]);

  const fetchScans = useCallback(async (offset = 0, append = false) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(`/api/scans?limit=${LIMIT}&offset=${offset}`);
      const data = await res.json();
      const newScans = data.scans || [];
      
      setScans(prev => append ? [...prev, ...newScans] : newScans);
      setTotal(data.total || 0);
      setTotalRepos(data.totalRepos || 0);
      setHasMore(newScans.length === LIMIT);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchScans();
  }, [fetchScans]);

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          fetchScans(scans.length, true);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [loading, loadingMore, hasMore, scans.length, fetchScans]);

  const triggerScan = async (repo?: string) => {
    setScanning(repo || "all");
    try {
      const url = repo 
        ? `https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos?repo=${repo}`
        : "https://mojsubkqjdruhpxbzgme.supabase.co/functions/v1/scan-repos";
      await fetch(url, { headers: { Authorization: "Bearer foodshare-cron-2026" } });
      fetchScans();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Security Scans</h1>
          <p className="text-zinc-500">{uniqueRepos.length} repos • {total} scans</p>
        </div>
        <Button onClick={() => triggerScan()} disabled={!!scanning} className="bg-emerald-600 hover:bg-emerald-700">
          {scanning === "all" ? "Scanning..." : "🔍 Scan All Repos"}
        </Button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Total Issues</div>
            <div className="text-2xl font-bold text-white">{stats.totalIssues}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Avg Score</div>
            <div className="text-2xl font-bold text-white">{stats.avgScore}/100</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-sm text-zinc-400">Critical Issues</div>
            <div className="text-2xl font-bold text-red-400">{stats.criticalCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={repoFilter} onValueChange={setRepoFilter}>
          <SelectTrigger className="w-48 bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Filter by repo" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all">All Repos</SelectItem>
            {uniqueRepos.map(repo => (
              <SelectItem key={repo} value={repo}>{repo}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-48 bg-zinc-900 border-zinc-800">
            <SelectValue placeholder="Filter by severity" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {filteredScans.map(scan => {
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
                      <p className="text-sm text-zinc-500 mt-1 line-clamp-1">{scan.summary}</p>
                      <div className="flex gap-4 mt-2 text-xs text-zinc-600">
                        <span>Score: {scan.security_score}/100</span>
                        <span>Files: {scan.files_scanned}</span>
                        <span>{new Date(scan.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {scan.scan_metadata?.by_severity && (
                      <div className="hidden sm:flex gap-1 text-xs">
                        {scan.scan_metadata.by_severity.critical > 0 && <Badge className="bg-red-500">{scan.scan_metadata.by_severity.critical} crit</Badge>}
                        {scan.scan_metadata.by_severity.high > 0 && <Badge className="bg-orange-500">{scan.scan_metadata.by_severity.high} high</Badge>}
                        {scan.scan_metadata.by_severity.medium > 0 && <Badge className="bg-yellow-600">{scan.scan_metadata.by_severity.medium} med</Badge>}
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
                    <h4 className="text-sm font-medium text-white mb-2">Issues ({scan.issues.length})</h4>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
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

        {/* Infinite scroll trigger */}
        <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
          {loadingMore && <span className="text-zinc-500">Loading more...</span>}
          {!hasMore && scans.length > 0 && <span className="text-zinc-600 text-sm">All scans loaded</span>}
        </div>
      </div>
    </div>
  );
}
