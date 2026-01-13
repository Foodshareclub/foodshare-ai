"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface RepoConfig {
  id: string;
  full_name: string;
  enabled: boolean;
  auto_review: boolean;
  categories: string[];
  ignore_paths: string[];
  custom_instructions: string;
  created_at: string;
}

interface ReviewHistory {
  id: string;
  repo_full_name: string;
  pr_number: number;
  status: string;
  is_incremental: boolean;
  created_at: string;
}

const CATEGORIES = ["security", "bug", "performance", "style", "maintainability"];

export default function RepoReviewsPage() {
  const [configs, setConfigs] = useState<RepoConfig[]>([]);
  const [history, setHistory] = useState<ReviewHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRepo, setNewRepo] = useState("");
  const [adding, setAdding] = useState(false);
  const [triggerRepo, setTriggerRepo] = useState("");
  const [triggerPR, setTriggerPR] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editIgnorePaths, setEditIgnorePaths] = useState("");
  const [editInstructions, setEditInstructions] = useState("");

  const fetchData = async () => {
    const [configsRes, historyRes] = await Promise.all([
      fetch("/api/repo-configs"),
      fetch("/api/review-history?limit=20"),
    ]);
    if (configsRes.ok) setConfigs(await configsRes.json());
    if (historyRes.ok) setHistory(await historyRes.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addRepo = async () => {
    if (!newRepo.includes("/")) return;
    setAdding(true);
    const res = await fetch("/api/repo-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: newRepo }),
    });
    if (res.ok) {
      setNewRepo("");
      fetchData();
    }
    setAdding(false);
  };

  const toggleEnabled = async (config: RepoConfig) => {
    await fetch("/api/repo-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...config, enabled: !config.enabled }),
    });
    fetchData();
  };

  const toggleAutoReview = async (config: RepoConfig) => {
    await fetch("/api/repo-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...config, auto_review: !config.auto_review }),
    });
    fetchData();
  };

  const toggleCategory = async (config: RepoConfig, cat: string) => {
    const categories = config.categories.includes(cat)
      ? config.categories.filter((c) => c !== cat)
      : [...config.categories, cat];
    await fetch("/api/repo-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...config, categories }),
    });
    fetchData();
  };

  const removeRepo = async (full_name: string) => {
    await fetch(`/api/repo-configs?full_name=${encodeURIComponent(full_name)}`, { method: "DELETE" });
    fetchData();
  };

  const startEditing = (config: RepoConfig) => {
    setEditingConfig(config.id);
    setEditIgnorePaths((config.ignore_paths || []).join("\n"));
    setEditInstructions(config.custom_instructions || "");
  };

  const saveConfig = async (config: RepoConfig) => {
    await fetch("/api/repo-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...config,
        ignore_paths: editIgnorePaths.split("\n").filter(Boolean),
        custom_instructions: editInstructions,
      }),
    });
    setEditingConfig(null);
    fetchData();
  };

  const triggerReview = async () => {
    if (!triggerRepo.includes("/") || !triggerPR) return;
    setTriggering(true);
    const [owner, repo] = triggerRepo.split("/");
    await fetch("/api/trigger-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, repo, pr_number: parseInt(triggerPR, 10) }),
    });
    setTriggerRepo("");
    setTriggerPR("");
    setTriggering(false);
    fetchData();
  };

  const getStatusBadge = (status: string, isIncremental?: boolean) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      completed: "default",
      pending: "secondary",
      failed: "destructive",
    };
    return (
      <div className="flex gap-1">
        <Badge variant={variants[status] || "secondary"}>{status}</Badge>
        {isIncremental && <Badge variant="outline">incremental</Badge>}
      </div>
    );
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">🤖 AI Code Reviews</h2>
        <p className="text-muted-foreground">CodeRabbit-style automated PR reviews</p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl mb-1">🔍</div>
          <div className="font-medium">Smart Review</div>
          <div className="text-xs text-muted-foreground">Security, bugs, performance</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl mb-1">🔄</div>
          <div className="font-medium">Incremental</div>
          <div className="text-xs text-muted-foreground">Only new changes</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl mb-1">💬</div>
          <div className="font-medium">Interactive</div>
          <div className="text-xs text-muted-foreground">Reply @ai for help</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl mb-1">📝</div>
          <div className="font-medium">Walkthrough</div>
          <div className="text-xs text-muted-foreground">File-by-file summary</div>
        </Card>
      </div>

      {/* Manual Trigger */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger Manual Review</CardTitle>
          <CardDescription>Run a review on any PR right now</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="owner/repo"
            value={triggerRepo}
            onChange={(e) => setTriggerRepo(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="PR #"
            type="number"
            value={triggerPR}
            onChange={(e) => setTriggerPR(e.target.value)}
            className="w-24"
          />
          <Button onClick={triggerReview} disabled={triggering || !triggerRepo.includes("/") || !triggerPR}>
            {triggering ? "Reviewing..." : "Review"}
          </Button>
        </CardContent>
      </Card>

      {/* Add Repository */}
      <Card>
        <CardHeader>
          <CardTitle>Add Repository</CardTitle>
          <CardDescription>Enable auto-reviews for a repository (owner/repo)</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="owner/repo"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={addRepo} disabled={adding || !newRepo.includes("/")}>
            {adding ? "Adding..." : "Add"}
          </Button>
        </CardContent>
      </Card>

      {/* Configured Repos */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Configured Repositories</h3>
        {configs.map((config) => (
          <Card key={config.id} className={!config.enabled ? "opacity-60" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{config.full_name}</CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={config.enabled ? "default" : "outline"}
                    onClick={() => toggleEnabled(config)}
                  >
                    {config.enabled ? "Enabled" : "Disabled"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removeRepo(config.full_name)}>
                    Remove
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.auto_review}
                  onChange={() => toggleAutoReview(config)}
                  className="rounded"
                />
                <span className="text-sm">Auto-review on PR open/update</span>
              </div>
              <div>
                <span className="text-sm font-medium">Review focus:</span>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {CATEGORIES.map((cat) => (
                    <Badge
                      key={cat}
                      variant={config.categories.includes(cat) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCategory(config, cat)}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Advanced Settings */}
              {editingConfig === config.id ? (
                <div className="space-y-3 pt-3 border-t">
                  <div>
                    <label className="text-sm font-medium">Ignore Paths (one per line)</label>
                    <textarea
                      className="w-full mt-1 p-2 text-sm bg-background border rounded-md"
                      rows={3}
                      placeholder="*.test.ts&#10;docs/*&#10;*.md"
                      value={editIgnorePaths}
                      onChange={(e) => setEditIgnorePaths(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Custom Instructions</label>
                    <textarea
                      className="w-full mt-1 p-2 text-sm bg-background border rounded-md"
                      rows={3}
                      placeholder="Focus on TypeScript best practices. Ignore styling issues."
                      value={editInstructions}
                      onChange={(e) => setEditInstructions(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveConfig(config)}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingConfig(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => startEditing(config)} className="mt-2">
                  ⚙️ Advanced Settings
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {configs.length === 0 && (
          <p className="text-muted-foreground text-center py-8">No repositories configured yet</p>
        )}
      </div>

      {/* Review History */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Recent Reviews</h3>
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="p-3">Repository</th>
                  <th className="p-3">PR</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{h.repo_full_name}</td>
                    <td className="p-3">#{h.pr_number}</td>
                    <td className="p-3">{getStatusBadge(h.status, h.is_incremental)}</td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {new Date(h.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No reviews yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
