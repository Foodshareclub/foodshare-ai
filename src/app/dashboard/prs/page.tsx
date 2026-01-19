"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PR {
  repo?: string;
  number: number;
  title: string;
  state: string;
  user: string;
  user_type: string | null;
  created_at: string;
  url: string;
  additions: number;
  deletions: number;
  changed_files: number;
  is_llm_generated: boolean;
  llm_tool: string | null;
  llm_tool_display: string | null;
  llm_tool_emoji: string | null;
  llm_confidence: number | null;
  draft: boolean;
  head_ref: string;
  base_ref: string;
  labels: string[];
}

interface Stats {
  total: number;
  llmGenerated: number;
  humanGenerated: number;
  llmPercentage: number;
  byTool: Array<{
    tool: string;
    display: string;
    emoji: string;
    count: number;
    percentage: number;
  }>;
  byState: Record<string, number>;
  repos: string[];
}

type FilterType = "all" | "ai" | "human";

export default function PRsPage() {
  const [prs, setPRs] = useState<PR[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [repoFilter, setRepoFilter] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | "open" | "closed" | "merged">("all");
  const [mergingPR, setMergingPR] = useState<PR | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("squash");
  const [mergeError, setMergeError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [prsRes, statsRes] = await Promise.all([
        fetch("/api/pulls?source=db"),
        fetch("/api/pulls/stats"),
      ]);
      const prsData = await prsRes.json();
      const statsData = await statsRes.json();
      setPRs(prsData.pulls || []);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const syncRepo = async (repoFullName: string) => {
    setSyncing(repoFullName);
    const [owner, repo] = repoFullName.split("/");
    try {
      await fetch("/api/pulls/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      await fetchData();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(null);
    }
  };

  const syncAllRepos = async () => {
    setSyncingAll(true);
    try {
      await fetch("/api/pulls/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "open" }),
      });
      await fetchData();
    } catch (err) {
      console.error("Sync all failed:", err);
    } finally {
      setSyncingAll(false);
    }
  };

  const mergePR = async () => {
    if (!mergingPR) return;

    setMerging(true);
    setMergeError(null);

    const [owner, repo] = (mergingPR.repo || "").split("/");
    if (!owner || !repo) {
      setMergeError("Invalid repository format");
      setMerging(false);
      return;
    }

    try {
      const res = await fetch("/api/pulls/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          pr_number: mergingPR.number,
          merge_method: mergeMethod,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMergeError(data.error || "Failed to merge PR");
        setMerging(false);
        return;
      }

      // Success - close dialog and refresh
      setMergingPR(null);
      await fetchData();
    } catch (err) {
      console.error("Merge failed:", err);
      setMergeError("Network error - please try again");
    } finally {
      setMerging(false);
    }
  };

  const openMergeDialog = (pr: PR, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMergeError(null);
    setMergingPR(pr);
  };

  const filteredPRs = prs.filter(pr => {
    if (filter === "ai" && !pr.is_llm_generated) return false;
    if (filter === "human" && pr.is_llm_generated) return false;
    if (repoFilter && pr.repo !== repoFilter) return false;
    if (stateFilter !== "all" && pr.state !== stateFilter) return false;
    return true;
  });

  // Open AI-generated PRs for featured section
  const openAIPRs = prs.filter(pr => pr.is_llm_generated && pr.state === "open");

  const getStateBadge = (state: string) => {
    switch (state) {
      case "open":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Open</Badge>;
      case "closed":
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Closed</Badge>;
      case "merged":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Merged</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  const getLLMBadge = (pr: PR) => {
    if (!pr.is_llm_generated) return null;
    const emoji = pr.llm_tool_emoji || "🤖";
    const label = pr.llm_tool_display || "AI";
    const confidence = pr.llm_confidence ? Math.round(pr.llm_confidence * 100) : null;

    return (
      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
        {emoji} {label}
        {confidence && <span className="text-blue-300/60 text-xs">({confidence}%)</span>}
      </Badge>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Pull Requests</h1>
        <p className="text-zinc-500">
          {stats?.total || 0} stored PRs • {stats?.llmGenerated || 0} AI-generated ({stats?.llmPercentage || 0}%)
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold text-white">{stats.total}</div>
              <div className="text-sm text-zinc-500">Total PRs</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold text-blue-400">{stats.llmGenerated}</div>
              <div className="text-sm text-zinc-500">AI Generated</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold text-emerald-400">{stats.humanGenerated}</div>
              <div className="text-sm text-zinc-500">Human</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-4 text-center">
              <div className="text-3xl font-bold text-amber-400">{stats.llmPercentage}%</div>
              <div className="text-sm text-zinc-500">AI Ratio</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tool Breakdown */}
      {stats && stats.byTool.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="py-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">AI Tools Distribution</h3>
            <div className="flex flex-wrap gap-3">
              {stats.byTool.map(tool => (
                <div key={tool.tool} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg">
                  <span>{tool.emoji}</span>
                  <span className="text-white font-medium">{tool.display}</span>
                  <Badge variant="outline" className="text-xs">{tool.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Featured Open AI PRs */}
      {openAIPRs.length > 0 && (
        <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-500/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-blue-300 flex items-center gap-2">
                🤖 Open AI-Generated PRs
                <Badge className="bg-blue-500/30 text-blue-300">{openAIPRs.length}</Badge>
              </h3>
              <span className="text-xs text-blue-400/60">Awaiting review</span>
            </div>
            <div className="space-y-2">
              {openAIPRs.slice(0, 5).map(pr => (
                <a
                  key={`featured-${pr.repo}#${pr.number}`}
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2 bg-zinc-900/50 rounded-lg hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-blue-400">{pr.llm_tool_emoji || "🤖"}</span>
                    <span className="text-zinc-400 text-sm">{pr.repo}</span>
                    <span className="text-zinc-500 text-sm">#{pr.number}</span>
                    <span className="text-white text-sm truncate flex-1">{pr.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-500/20 text-blue-300 text-xs">{pr.llm_tool_display || "AI"}</Badge>
                    <span className="text-zinc-500">→</span>
                  </div>
                </a>
              ))}
              {openAIPRs.length > 5 && (
                <div className="text-center text-xs text-blue-400/60 pt-1">
                  +{openAIPRs.length - 5} more open AI PRs
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={repoFilter}
          onChange={e => setRepoFilter(e.target.value)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
        >
          <option value="">All repos</option>
          {stats?.repos.map(repo => (
            <option key={repo} value={repo}>{repo}</option>
          ))}
        </select>

        <select
          value={stateFilter}
          onChange={e => setStateFilter(e.target.value as typeof stateFilter)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
        >
          <option value="all">All states</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="merged">Merged</option>
        </select>

        <div className="flex gap-1">
          {(["all", "ai", "human"] as FilterType[]).map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? "bg-emerald-600" : ""}
            >
              {f === "all" ? "All" : f === "ai" ? "🤖 AI" : "👤 Human"}
            </Button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={syncAllRepos}
          disabled={syncingAll || !!syncing}
          className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
        >
          {syncingAll ? "Syncing..." : "🔄 Sync All Repos"}
        </Button>

        {repoFilter && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncRepo(repoFilter)}
            disabled={!!syncing || syncingAll}
          >
            {syncing === repoFilter ? "Syncing..." : "🔄 Sync"}
          </Button>
        )}
      </div>

      {/* PR List */}
      <div className="space-y-3">
        {filteredPRs.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-12 text-center">
              <p className="text-zinc-500">No pull requests found</p>
              <p className="text-zinc-600 text-sm mt-2">
                PRs are synced via webhooks or manually using the sync button
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredPRs.map(pr => (
            <Card key={`${pr.repo}#${pr.number}`} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{pr.repo}</span>
                      <span className="text-zinc-500">#{pr.number}</span>
                      {getStateBadge(pr.state)}
                      {getLLMBadge(pr)}
                      {pr.draft && (
                        <Badge variant="outline" className="text-zinc-500">Draft</Badge>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mt-1 truncate">{pr.title}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-600">
                      <span>by {pr.user}</span>
                      <span>•</span>
                      <span>{new Date(pr.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="text-green-400">+{pr.additions}</span>
                      <span className="text-red-400">-{pr.deletions}</span>
                      <span>•</span>
                      <span>{pr.changed_files} files</span>
                    </div>
                    {pr.labels.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {pr.labels.slice(0, 5).map(label => (
                          <Badge key={label} variant="outline" className="text-xs">
                            {label}
                          </Badge>
                        ))}
                        {pr.labels.length > 5 && (
                          <Badge variant="outline" className="text-xs text-zinc-500">
                            +{pr.labels.length - 5}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {pr.state === "open" && !pr.draft && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => openMergeDialog(pr, e)}
                        className="border-green-500/50 text-green-400 hover:bg-green-500/10"
                      >
                        Merge
                      </Button>
                    )}
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-600 hover:text-zinc-400 text-sm p-2"
                    >
                      →
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Merge Confirmation Dialog */}
      <Dialog open={!!mergingPR} onOpenChange={(open) => !open && setMergingPR(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Pull Request</DialogTitle>
            <DialogDescription>
              {mergingPR && (
                <span className="block mt-2">
                  <span className="text-zinc-300 font-medium">{mergingPR.repo}</span>
                  <span className="text-zinc-500"> #{mergingPR.number}</span>
                  <span className="block text-zinc-400 mt-1">{mergingPR.title}</span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Merge Method</label>
              <select
                value={mergeMethod}
                onChange={(e) => setMergeMethod(e.target.value as typeof mergeMethod)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
              >
                <option value="squash">Squash and merge</option>
                <option value="merge">Create a merge commit</option>
                <option value="rebase">Rebase and merge</option>
              </select>
              <p className="text-xs text-zinc-500">
                {mergeMethod === "squash" && "Combines all commits into one before merging"}
                {mergeMethod === "merge" && "Preserves all commits with a merge commit"}
                {mergeMethod === "rebase" && "Applies commits on top of the base branch"}
              </p>
            </div>

            {mergeError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">{mergeError}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMergingPR(null)}
              disabled={merging}
            >
              Cancel
            </Button>
            <Button
              onClick={mergePR}
              disabled={merging}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {merging ? "Merging..." : "Confirm Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
