"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
}

interface RepoConfig {
  id: string;
  full_name: string;
  enabled: boolean;
  auto_review: boolean;
  categories: string[];
  ignore_paths: string[];
  custom_instructions: string;
}

export default function ReposPage() {
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [configs, setConfigs] = useState<RepoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchData = async () => {
    const [ghRes, cfgRes] = await Promise.all([
      fetch("/api/github/repos").then(r => r.json()),
      fetch("/api/repos/config").then(r => r.json()),
    ]);
    setGithubRepos(ghRes.repos || []);
    setConfigs(cfgRes.configs || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const configuredNames = new Set(configs.map(c => c.full_name));
  const availableRepos = githubRepos.filter(r => !configuredNames.has(r.full_name));

  const addRepo = async () => {
    if (!selectedRepo) return;
    setAdding(true);
    await fetch("/api/repos/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: selectedRepo }),
    });
    setSelectedRepo("");
    await fetchData();
    setAdding(false);
  };

  const toggleRepo = async (id: string, field: "enabled" | "auto_review", value: boolean) => {
    await fetch(`/api/repos/config/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    fetchData();
  };

  const deleteRepo = async (id: string) => {
    if (!confirm("Remove this repository from AI review?")) return;
    await fetch(`/api/repos/config/${id}`, { method: "DELETE" });
    fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading repositories...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Repositories</h1>
        <p className="text-zinc-500">Select repositories to enable AI code review</p>
      </div>

      {/* Add Repo Dropdown */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Add Repository</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <select
              value={selectedRepo}
              onChange={e => setSelectedRepo(e.target.value)}
              className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white appearance-none cursor-pointer"
            >
              <option value="">Select a repository...</option>
              {availableRepos.map(repo => (
                <option key={repo.id} value={repo.full_name}>
                  {repo.full_name} {repo.private ? "🔒" : ""}
                </option>
              ))}
            </select>
            <Button 
              onClick={addRepo} 
              disabled={adding || !selectedRepo} 
              className="bg-emerald-600 hover:bg-emerald-700 px-6"
            >
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>
          {availableRepos.length === 0 && githubRepos.length > 0 && (
            <p className="text-sm text-zinc-500 mt-2">All your repositories are already configured</p>
          )}
        </CardContent>
      </Card>

      {/* Configured Repos */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Configured Repositories ({configs.length})</h2>
        <div className="space-y-3">
          {configs.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="py-12 text-center">
                <p className="text-zinc-500 mb-2">No repositories configured yet</p>
                <p className="text-sm text-zinc-600">Select a repository above to enable AI code reviews</p>
              </CardContent>
            </Card>
          ) : (
            configs.map(repo => (
              <Card key={repo.id} className="bg-zinc-900 border-zinc-800">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">📁</span>
                      <div>
                        <a
                          href={`https://github.com/${repo.full_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-white hover:text-emerald-400"
                        >
                          {repo.full_name}
                        </a>
                        <div className="flex gap-2 mt-1">
                          {repo.categories?.map(cat => (
                            <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-zinc-500">Enabled</label>
                        <button
                          onClick={() => toggleRepo(repo.id, "enabled", !repo.enabled)}
                          className={`w-10 h-6 rounded-full transition-colors ${repo.enabled ? "bg-emerald-500" : "bg-zinc-700"}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${repo.enabled ? "translate-x-4" : ""}`} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-zinc-500">Auto-review</label>
                        <button
                          onClick={() => toggleRepo(repo.id, "auto_review", !repo.auto_review)}
                          className={`w-10 h-6 rounded-full transition-colors ${repo.auto_review ? "bg-emerald-500" : "bg-zinc-700"}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${repo.auto_review ? "translate-x-4" : ""}`} />
                        </button>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setEditingId(editingId === repo.id ? null : repo.id)}>
                        {editingId === repo.id ? "Close" : "Configure"}
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-400 hover:text-red-300" onClick={() => deleteRepo(repo.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>

                  {editingId === repo.id && (
                    <div className="mt-4 pt-4 border-t border-zinc-800 space-y-4">
                      <div>
                        <label className="text-sm text-zinc-400 block mb-1">Ignore Paths (comma-separated)</label>
                        <input
                          defaultValue={repo.ignore_paths?.join(", ")}
                          placeholder="node_modules, dist, .next, coverage"
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                          onBlur={async (e) => {
                            const paths = e.target.value.split(",").map(p => p.trim()).filter(Boolean);
                            await fetch(`/api/repos/config/${repo.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ignore_paths: paths }),
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm text-zinc-400 block mb-1">Custom Instructions</label>
                        <textarea
                          defaultValue={repo.custom_instructions}
                          placeholder="Focus on TypeScript best practices, security vulnerabilities..."
                          rows={3}
                          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                          onBlur={async (e) => {
                            await fetch(`/api/repos/config/${repo.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ custom_instructions: e.target.value }),
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
