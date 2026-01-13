"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const [llmProvider, setLlmProvider] = useState("groq");
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "online" | "offline">("checking");
  const [ollamaHost, setOllamaHost] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  const checkOllamaStatus = async () => {
    setOllamaStatus("checking");
    try {
      const res = await fetch("/api/ollama/status");
      const data = await res.json();
      setOllamaStatus(data.status);
      setOllamaHost(data.host || "");
      setOllamaModels(data.models || []);
    } catch {
      setOllamaStatus("offline");
    }
  };

  useEffect(() => {
    setLlmProvider(process.env.NEXT_PUBLIC_LLM_PROVIDER || "groq");
    checkOllamaStatus();
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
          <CardDescription>Choose the AI model provider for code reviews</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button variant={llmProvider === "groq" ? "default" : "outline"} onClick={() => setLlmProvider("groq")}>
              Groq API
            </Button>
            <Button variant={llmProvider === "ollama" ? "default" : "outline"} onClick={() => setLlmProvider("ollama")}>
              Ollama (Self-hosted)
            </Button>
          </div>

          {llmProvider === "ollama" && (
            <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-md space-y-4">
              <div>
                <h4 className="font-medium mb-2">Ollama Configuration</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connected to: <code className="bg-gray-200 dark:bg-zinc-800 px-2 py-1 rounded">{ollamaHost}</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm">Status:</span>
                <Badge className={ollamaStatus === "online" ? "bg-green-500" : ollamaStatus === "offline" ? "bg-red-500" : "bg-yellow-500"}>
                  {ollamaStatus === "checking" ? "Checking..." : ollamaStatus}
                </Badge>
                <Button variant="outline" size="sm" onClick={checkOllamaStatus}>
                  Refresh
                </Button>
              </div>

              {ollamaModels.length > 0 && (
                <div>
                  <span className="text-sm font-medium">Available Models:</span>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {ollamaModels.map((m) => (
                      <Badge key={m} variant="outline">{m}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {llmProvider === "groq" && (
            <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-md">
              <h4 className="font-medium mb-2">Groq API Configuration</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Using Groq cloud API. Configure via environment variables.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub Integration</CardTitle>
          <CardDescription>Configure GitHub access for PR reviews</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <h4 className="font-medium mb-2">Webhook URL</h4>
            <code className="block p-2 bg-gray-100 dark:bg-zinc-900 rounded text-sm">
              {typeof window !== "undefined" ? `${window.location.origin}/api/webhook/github` : "/api/webhook/github"}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
