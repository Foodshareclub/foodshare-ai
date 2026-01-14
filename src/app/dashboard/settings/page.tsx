"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startRegistration } from "@simplewebauthn/browser";

interface Stats {
  reviews: number;
  repos: number;
}

interface OllamaStatus {
  status: string;
  host: string;
  models: string[];
}

interface Passkey {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

export default function SettingsPage() {
  const [stats, setStats] = useState<Stats>({ reviews: 0, repos: 0 });
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState("");

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(setStats);
    setWebhookUrl(typeof window !== "undefined" ? `${window.location.origin}/api/webhook/github` : "");
    checkOllama();
    loadPasskeys();
  }, []);

  const loadPasskeys = async () => {
    try {
      const res = await fetch("/api/auth/passkey");
      const data = await res.json();
      setPasskeys(data.passkeys || []);
    } catch { /* ignore */ }
  };

  const registerPasskey = async () => {
    setRegisteringPasskey(true);
    setPasskeyMessage("");
    try {
      const optionsRes = await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-options" }),
      });
      const options = await optionsRes.json();
      if (options.error) throw new Error(options.error);

      const credential = await startRegistration(options);

      const verifyRes = await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register-verify", credential, deviceName: navigator.userAgent.split(" ").pop() }),
      });
      const result = await verifyRes.json();

      if (result.success) {
        setPasskeyMessage("✅ Passkey registered successfully!");
        loadPasskeys();
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      setPasskeyMessage(`❌ ${err.message || "Registration failed"}`);
    }
    setRegisteringPasskey(false);
  };

  const deletePasskey = async (id: string) => {
    if (!confirm("Remove this passkey?")) return;
    await fetch(`/api/auth/passkey?id=${id}`, { method: "DELETE" });
    loadPasskeys();
  };

  const checkOllama = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/ollama/status");
      const data = await res.json();
      setOllamaStatus(data);
    } catch {
      setOllamaStatus({ status: "offline", host: "", models: [] });
    }
    setChecking(false);
  };

  const testWebhook = async () => {
    setTestingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await fetch("/api/webhook/github", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-github-event": "ping" },
        body: JSON.stringify({ zen: "Test ping" }),
      });
      setWebhookResult(res.ok ? "✅ Webhook endpoint is working" : "❌ Webhook returned error");
    } catch {
      setWebhookResult("❌ Failed to reach webhook");
    }
    setTestingWebhook(false);
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
  };

  const clearAllReviews = async () => {
    if (!confirm("Delete ALL review history? This cannot be undone.")) return;
    if (!confirm("Are you really sure? This will delete all reviews.")) return;
    // Would need a bulk delete endpoint
    alert("Bulk delete not implemented yet");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-500">Configure your AI code review service</p>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-white">{stats.reviews}</div>
            <div className="text-sm text-zinc-500">Total Reviews</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-white">{stats.repos}</div>
            <div className="text-sm text-zinc-500">Connected Repos</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-emerald-400">Groq</div>
            <div className="text-sm text-zinc-500">LLM Provider</div>
          </CardContent>
        </Card>
      </div>

      {/* Passkey / Fingerprint Authentication */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">🔐 Passkey Authentication</CardTitle>
          <CardDescription>Sign in with fingerprint, Face ID, or security key</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">
                Passkeys provide passwordless authentication using your device&apos;s biometrics.
              </p>
            </div>
            <Button onClick={registerPasskey} disabled={registeringPasskey} className="bg-emerald-600 hover:bg-emerald-500">
              {registeringPasskey ? "Registering..." : "+ Add Passkey"}
            </Button>
          </div>
          
          {passkeyMessage && (
            <p className={`text-sm ${passkeyMessage.includes("✅") ? "text-emerald-400" : "text-red-400"}`}>
              {passkeyMessage}
            </p>
          )}

          {passkeys.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-zinc-400">Registered Passkeys</h4>
              {passkeys.map(pk => (
                <div key={pk.id} className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🔑</span>
                    <div>
                      <div className="text-sm text-white">{pk.device_name}</div>
                      <div className="text-xs text-zinc-500">
                        Added {new Date(pk.created_at).toLocaleDateString()}
                        {pk.last_used_at && ` • Last used ${new Date(pk.last_used_at).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="text-red-400 border-red-400" onClick={() => deletePasskey(pk.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {passkeys.length === 0 && (
            <div className="text-center py-6 text-zinc-500">
              <p>No passkeys registered yet</p>
              <p className="text-sm">Add a passkey to enable fingerprint login</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LLM Configuration */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">🤖 LLM Configuration</CardTitle>
          <CardDescription>AI model settings for code reviews</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white">Groq API</span>
                <Badge className="bg-emerald-500">Primary</Badge>
              </div>
              <p className="text-sm text-zinc-400">Fast cloud-based inference using Llama 3.1</p>
              <p className="text-xs text-zinc-500 mt-2">Model: llama-3.1-8b-instant</p>
            </div>
            <div className="p-4 bg-zinc-800 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-white">Ollama</span>
                <Badge variant="outline" className={ollamaStatus?.status === "online" ? "border-emerald-500 text-emerald-400" : "border-zinc-600 text-zinc-500"}>
                  {checking ? "Checking..." : ollamaStatus?.status || "Unknown"}
                </Badge>
              </div>
              <p className="text-sm text-zinc-400">Self-hosted fallback option</p>
              {ollamaStatus?.host && (
                <p className="text-xs text-zinc-500 mt-2">Host: {ollamaStatus.host}</p>
              )}
              {ollamaStatus?.models && ollamaStatus.models.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {ollamaStatus.models.map(m => (
                    <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={checkOllama} disabled={checking} className="mt-3">
                {checking ? "Checking..." : "Check Status"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GitHub Webhook */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">🔗 GitHub Webhook</CardTitle>
          <CardDescription>Configure automatic PR reviews</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 block mb-1">Webhook URL</label>
            <div className="flex gap-2">
              <input
                value={webhookUrl}
                readOnly
                className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono text-sm"
              />
              <Button variant="outline" onClick={copyWebhookUrl}>Copy</Button>
              <Button variant="outline" onClick={testWebhook} disabled={testingWebhook}>
                {testingWebhook ? "Testing..." : "Test"}
              </Button>
            </div>
            {webhookResult && (
              <p className={`text-sm mt-2 ${webhookResult.includes("✅") ? "text-emerald-400" : "text-red-400"}`}>
                {webhookResult}
              </p>
            )}
          </div>
          <div className="p-4 bg-zinc-800 rounded-lg">
            <h4 className="font-medium text-white mb-2">Setup Instructions</h4>
            <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
              <li>Go to your GitHub repo → Settings → Webhooks</li>
              <li>Click &quot;Add webhook&quot;</li>
              <li>Paste the webhook URL above</li>
              <li>Set Content type to &quot;application/json&quot;</li>
              <li>Select events: &quot;Pull requests&quot; and &quot;Issue comments&quot;</li>
              <li>Save the webhook</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Review Categories */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">🔍 Review Categories</CardTitle>
          <CardDescription>What the AI reviews in your code</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { icon: "🔒", name: "Security", desc: "SQL injection, XSS, auth issues, secrets" },
              { icon: "🐛", name: "Bugs", desc: "Logic errors, null handling, edge cases" },
              { icon: "⚡", name: "Performance", desc: "N+1 queries, memory leaks, algorithms" },
              { icon: "✨", name: "Best Practices", desc: "SOLID, DRY, TypeScript, clean code" },
            ].map(cat => (
              <div key={cat.name} className="flex items-start gap-3 p-3 bg-zinc-800 rounded-lg">
                <span className="text-xl">{cat.icon}</span>
                <div>
                  <div className="font-medium text-white">{cat.name}</div>
                  <div className="text-sm text-zinc-500">{cat.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-zinc-900 border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-400">⚠️ Danger Zone</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-red-950/20 rounded-lg border border-red-900/30">
            <div>
              <div className="font-medium text-white">Clear Review History</div>
              <div className="text-sm text-zinc-500">Delete all review records from the database</div>
            </div>
            <Button variant="outline" className="text-red-400 border-red-400 hover:bg-red-950" onClick={clearAllReviews}>
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
