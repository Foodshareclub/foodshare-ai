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
  created_at: string;
}

const CATEGORIES = ["security", "bug", "performance", "style", "documentation"];

export default function RepoReviewsPage() {
  const [configs, setConfigs] = useState<RepoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRepo, setNewRepo] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchConfigs = async () => {
    const res = await fetch("/api/repo-configs");
    if (res.ok) setConfigs(await res.json());
    setLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, []);

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
      fetchConfigs();
    }
    setAdding(false);
  };

  const toggleEnabled = async (config: RepoConfig) => {
    await fetch("/api/repo-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...config, enabled: !config.enabled }),
    });
    fetchConfigs();
  };

  const toggleAutoReview = async (config: RepoConfig) => {
    await fetch("/api/repo-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...config, auto_review: !config.auto_review }),
    });
    fetchConfigs();
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
    fetchConfigs();
  };

  const removeRepo = async (full_name: string) => {
    await fetch(`/api/repo-configs?full_name=${encodeURIComponent(full_name)}`, { method: "DELETE" });
    fetchConfigs();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Repo Reviews</h2>
        <p className="text-gray-500">Manage automatic code reviews per repository</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Repository</CardTitle>
          <CardDescription>Enter owner/repo format (e.g., Foodshareclub/app)</CardDescription>
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

      <div className="space-y-4">
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
                <span className="text-sm font-medium">Review categories:</span>
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
            </CardContent>
          </Card>
        ))}
        {configs.length === 0 && (
          <p className="text-gray-500 text-center py-8">No repositories configured yet</p>
        )}
      </div>
    </div>
  );
}
