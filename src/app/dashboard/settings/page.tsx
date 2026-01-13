"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  const [llmProvider, setLlmProvider] = useState("groq");
  const [ollamaHost, setOllamaHost] = useState("");
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "online" | "offline">("checking");

  const checkOllamaStatus = async () => {
    setOllamaStatus("checking");
    try {
      const host = ollamaHost || "http://localhost:11434";
      const res = await fetch(`${host}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      setOllamaStatus(res.ok ? "online" : "offline");
    } catch {
      setOllamaStatus("offline");
    }
  };

  useEffect(() => {
    // Get initial values from environment
    setLlmProvider(process.env.NEXT_PUBLIC_LLM_PROVIDER || "groq");
    setOllamaHost(process.env.NEXT_PUBLIC_OLLAMA_HOST || "");
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-gray-500">Configure the code review service</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LLM Provider</CardTitle>
          <CardDescription>
            Choose the AI model provider for code reviews
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button
              variant={llmProvider === "groq" ? "default" : "outline"}
              onClick={() => setLlmProvider("groq")}
            >
              Groq API
            </Button>
            <Button
              variant={llmProvider === "ollama" ? "default" : "outline"}
              onClick={() => setLlmProvider("ollama")}
            >
              Ollama (Self-hosted)
            </Button>
          </div>

          {llmProvider === "groq" && (
            <div className="p-4 bg-gray-50 rounded-md">
              <h4 className="font-medium mb-2">Groq API Configuration</h4>
              <p className="text-sm text-gray-600 mb-2">
                Using Groq cloud API for fast LLM inference. Configure via environment variables.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-mono bg-gray-200 px-2 py-1 rounded">GROQ_API_KEY</span>
                  <Badge variant="outline">Required</Badge>
                </div>
                <div className="flex gap-2">
                  <span className="font-mono bg-gray-200 px-2 py-1 rounded">GROQ_MODEL</span>
                  <span className="text-gray-500">Default: llama-3.1-8b-instant</span>
                </div>
              </div>
            </div>
          )}

          {llmProvider === "ollama" && (
            <div className="p-4 bg-gray-50 rounded-md space-y-4">
              <div>
                <h4 className="font-medium mb-2">Ollama Configuration</h4>
                <p className="text-sm text-gray-600 mb-2">
                  Connect to a self-hosted Ollama instance for local LLM inference.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Ollama Host URL</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="http://localhost:11434"
                    value={ollamaHost}
                    onChange={(e) => setOllamaHost(e.target.value)}
                  />
                  <Button variant="outline" onClick={checkOllamaStatus}>
                    Test
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm">Status:</span>
                <Badge
                  className={
                    ollamaStatus === "online"
                      ? "bg-green-500"
                      : ollamaStatus === "offline"
                      ? "bg-red-500"
                      : "bg-yellow-500"
                  }
                >
                  {ollamaStatus === "checking" ? "Checking..." : ollamaStatus}
                </Badge>
              </div>

              <div className="text-sm text-gray-600">
                <p className="font-medium">Setup Instructions:</p>
                <ol className="list-decimal pl-4 space-y-1 mt-1">
                  <li>Install Ollama: <code className="bg-gray-200 px-1 rounded">curl -fsSL https://ollama.ai/install.sh | sh</code></li>
                  <li>Pull a model: <code className="bg-gray-200 px-1 rounded">ollama pull llama3.1:8b</code></li>
                  <li>Start the server: <code className="bg-gray-200 px-1 rounded">ollama serve</code></li>
                  <li>For remote access, expose via reverse proxy or Cloudflare Tunnel</li>
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub Integration</CardTitle>
          <CardDescription>
            Configure GitHub access for PR reviews
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-md">
            <h4 className="font-medium mb-2">Required Environment Variables</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-mono bg-gray-200 px-2 py-1 rounded">GITHUB_TOKEN</span>
                <p className="text-gray-500 mt-1">
                  Personal Access Token with repo read and PR write permissions
                </p>
              </div>
              <div>
                <span className="font-mono bg-gray-200 px-2 py-1 rounded">GITHUB_WEBHOOK_SECRET</span>
                <span className="text-gray-500 ml-2">(Optional) For webhook signature verification</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Webhook URL</h4>
            <p className="text-sm text-gray-600">
              Configure this URL in your GitHub repository webhook settings:
            </p>
            <code className="block mt-2 p-2 bg-gray-100 rounded text-sm">
              {typeof window !== "undefined" ? `${window.location.origin}/api/webhook/github` : "/api/webhook/github"}
            </code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review Configuration</CardTitle>
          <CardDescription>
            Customize code review behavior
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-md">
              <div>
                <h4 className="font-medium">Auto-review on PR Open</h4>
                <p className="text-sm text-gray-500">
                  Automatically trigger review when a PR is opened
                </p>
              </div>
              <Badge variant="outline">Via Webhook</Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-md">
              <div>
                <h4 className="font-medium">Review Categories</h4>
                <p className="text-sm text-gray-500">
                  Security, Bugs, Performance, Style
                </p>
              </div>
              <Badge variant="outline">All Enabled</Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-md">
              <div>
                <h4 className="font-medium">Max Diff Size</h4>
                <p className="text-sm text-gray-500">
                  Large diffs are truncated to fit token limits
                </p>
              </div>
              <Badge variant="outline">~4000 tokens</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
