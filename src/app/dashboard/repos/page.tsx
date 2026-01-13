"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

export default function ReposPage() {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRepo, setNewRepo] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchRepos = () => {
    fetch("/api/repos/config")
      .then(r => r.json())
      .then(data => setRepos(data.configs || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRepos(); }, []);

  const addRepo = async () => {
    if (!newRepo.includes("/")) return;
    setAdding(true);
    await fetch("/api/repos/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: newRepo }),
    });
    setNewRepo("");
    fetchRepos();
    setAdding(false);
  };

  const toggleRepo = async (id: string, field: "enabled" | "auto_review", value: boolean) => {
    await fetch(`/api/repos/config/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    fetchRepos();
  };

  const deleteRepo = async (id: string) => {
    if (!confirm("Remove this repository?")) return;
    await fetch(`/api/repos/config/${id}`, { method: "DELETE" });
    fetchRepos();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-zinc-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Repositories</h1>
        <p className="text-zinc-500">Manage repositories for AI code review</p>
      </div>

      {/* Add Repo */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Add Repository</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              placeholder="owner/repo (e.g., Foodshareclub/foodshare-ai)"
              value={newRepo}
              onChange={e => setNewRepo(e.target.value)}
              className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
              onKeyDown={e => e.key === "Enter" && addRepo()}
            />
            <Button onClick={addRepo} disabled={adding || !newRepo.includes("/")} className="bg-emerald-600 hover:bg-emerald-700">
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Repos List */}
      <div className="space-y-4">
        {repos.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="py-12 text-center">
              <p className="text-zinc-500 mb-2">No repositories configured</p>
              <p className="text-sm text-zinc-600">Add a repository above to enable AI code reviews</p>
            </CardContent>
          </Card>
        ) : (
          repos.map(repo => (
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
                      <label className="text-sm text-zinc-500">Auto</label>
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
                        placeholder="node_modules, dist, .next"
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
                        placeholder="Focus on TypeScript best practices..."
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
  );
}
