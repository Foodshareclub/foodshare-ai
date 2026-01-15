"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

interface ToolDef {
  name: string;
  description: string;
  category: string;
  params: string[];
  permission: "read" | "write" | "admin";
  examples?: string[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  status?: "success" | "error";
  duration?: number;
  cached?: boolean;
}

const CATEGORIES: Record<string, { icon: string; color: string }> = {
  reviews: { icon: "📝", color: "text-blue-400" },
  security: { icon: "🛡️", color: "text-red-400" },
  repos: { icon: "📁", color: "text-yellow-400" },
  queue: { icon: "⚙️", color: "text-purple-400" },
  analytics: { icon: "📊", color: "text-green-400" },
  github: { icon: "🔗", color: "text-orange-400" },
  system: { icon: "❓", color: "text-zinc-400" },
};

function formatMarkdown(text: string) {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-black/50 p-3 rounded-lg text-xs overflow-x-auto my-3 border border-zinc-700 font-mono"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-700/50 px-1.5 py-0.5 rounded text-emerald-400 text-xs font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/^• (.+)$/gm, '<div class="ml-4 flex gap-2"><span class="text-emerald-500">•</span><span>$1</span></div>')
    .replace(/^- (.+)$/gm, '<div class="ml-4 flex gap-2"><span class="text-zinc-500">-</span><span>$1</span></div>')
    .replace(/\n\n/g, '<div class="h-3"></div>')
    .replace(/\n/g, '<br/>');
}

function TimeAgo({ date }: { date: Date }) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return <span>just now</span>;
  if (seconds < 3600) return <span>{Math.floor(seconds / 60)}m ago</span>;
  return <span>{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
}

function parseSlashCommand(input: string, tools: ToolDef[]): { command: string; args: Record<string, string> } | null {
  if (!input.startsWith("/")) return null;
  const parts = input.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  if (!command) return null;
  
  const tool = tools.find(t => t.name === command);
  if (!tool) return null;
  
  const args: Record<string, string> = {};
  const argValues = parts.slice(1);
  
  tool.params.forEach((param, i) => {
    const paramName = param.replace("?", "");
    const val = argValues[i];
    if (val) args[paramName] = val;
  });
  
  return { command, args };
}

export default function ChatPage() {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch tools on mount
  useEffect(() => {
    fetch("/api/tools").then(r => r.json()).then(d => setTools(d.tools || [])).catch(() => {});
  }, []);

  const filteredCommands = useMemo(() => {
    if (!input.startsWith("/") || input.includes(" ")) return [];
    const search = input.slice(1).toLowerCase();
    return tools.filter(t => t.name.includes(search) || t.description.toLowerCase().includes(search));
  }, [input, tools]);

  useEffect(() => {
    setShowCommands(filteredCommands.length > 0);
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const selectCommand = (name: string) => {
    const tool = tools.find(t => t.name === name);
    setInput(tool?.params.length ? `/${name} ` : `/${name}`);
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const executeCommand = async (command: string, args: Record<string, string>): Promise<{ data?: string; error?: string; duration?: number; cached?: boolean }> => {
    const start = Date.now();
    try {
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, args }),
      });
      const result = await res.json();
      return {
        data: result.success ? result.data : undefined,
        error: result.success ? undefined : result.error,
        duration: result.metadata?.duration || (Date.now() - start),
        cached: result.metadata?.cacheHit,
      };
    } catch {
      return { error: "Network error", duration: Date.now() - start };
    }
  };

  const sendMessage = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    setShowCommands(false);
    if (inputRef.current) inputRef.current.style.height = "auto";

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMsg,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    // Slash command
    const parsed = parseSlashCommand(userMsg, tools);
    if (parsed) {
      const result = await executeCommand(parsed.command, parsed.args);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "system",
        content: result.data || result.error || "No response",
        timestamp: new Date(),
        status: result.error ? "error" : "success",
        duration: result.duration,
        cached: result.cached,
      }]);
      setLoading(false);
      inputRef.current?.focus();
      return;
    }

    // Natural language
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: messages.slice(-10) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response || data.error || "No response",
        timestamp: new Date(),
        status: data.error ? "error" : "success",
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Connection error. Please try again.",
        timestamp: new Date(),
        status: "error",
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === "Tab" || (e.key === "Enter" && filteredCommands.length > 0)) {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) selectCommand(cmd.name);
      } else if (e.key === "Escape") {
        setShowCommands(false);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { icon: "📊", label: "Stats", cmd: "/stats" },
    { icon: "📝", label: "Reviews", cmd: "/reviews" },
    { icon: "🛡️", label: "Scans", cmd: "/scans" },
    { icon: "📁", label: "Repos", cmd: "/repos" },
    { icon: "⚙️", label: "Queue", cmd: "/queue" },
    { icon: "❓", label: "Help", cmd: "/help" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <span className="text-xl">🤖</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">AI Assistant</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online • Type <kbd className="bg-zinc-800 px-1 rounded text-zinc-400">/</kbd> for commands
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-sm text-zinc-500 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear ({messages.length})
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/50 to-zinc-900 p-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 flex items-center justify-center mb-6 border border-emerald-500/20">
              <span className="text-4xl">💬</span>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">How can I help?</h2>
            <p className="text-zinc-500 text-sm mb-8 text-center max-w-md">
              Use slash commands for quick actions or ask naturally about your code reviews.
            </p>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 w-full max-w-2xl">
              {quickActions.map((a, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(a.cmd)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/50 hover:bg-zinc-800/70 hover:border-emerald-500/30 transition-all"
                >
                  <span className="text-xl">{a.icon}</span>
                  <span className="text-xs text-zinc-400">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role !== "user" && (
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    msg.role === "system" ? "bg-gradient-to-br from-blue-400 to-blue-600" : "bg-gradient-to-br from-emerald-400 to-emerald-600"
                  )}>
                    <span className="text-sm">{msg.role === "system" ? "⚡" : "🤖"}</span>
                  </div>
                )}
                <div className={cn("max-w-[80%] group", msg.role === "user" && "order-first")}>
                  <div className={cn(
                    "text-sm p-4 rounded-2xl",
                    msg.role === "user"
                      ? "bg-emerald-500 text-white rounded-tr-sm"
                      : msg.role === "system"
                      ? cn("rounded-tl-sm border", msg.status === "error" ? "bg-red-900/20 border-red-700/50" : "bg-blue-900/20 border-blue-700/50")
                      : "bg-zinc-800/80 text-zinc-200 rounded-tl-sm border border-zinc-700/50"
                  )}>
                    {msg.role !== "user" ? (
                      <div className="prose-sm" dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-2 mt-1 px-1 text-xs text-zinc-600", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <TimeAgo date={msg.timestamp} />
                    {msg.duration && <span>• {msg.duration}ms</span>}
                    {msg.cached && <span className="text-emerald-500">• cached</span>}
                    {msg.role !== "user" && (
                      <button
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {copied === msg.id ? "✓" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">👤</span>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                  <span className="text-sm">🤖</span>
                </div>
                <div className="bg-zinc-800/80 p-4 rounded-2xl rounded-tl-sm border border-zinc-700/50">
                  <div className="flex gap-1">
                    {[0, 150, 300].map(d => (
                      <span key={d} className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-4 relative">
        {showCommands && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
            {filteredCommands.map((cmd, i) => {
              const cat = CATEGORIES[cmd.category] || CATEGORIES.system;
              return (
                <button
                  key={cmd.name}
                  onClick={() => selectCommand(cmd.name)}
                  className={cn(
                    "w-full px-4 py-3 flex items-center gap-3 text-left transition-colors border-b border-zinc-800 last:border-0",
                    i === selectedIndex ? "bg-emerald-500/10" : "hover:bg-zinc-800"
                  )}
                >
                  <span className={cat?.color || "text-zinc-400"}>{cat?.icon || "•"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-mono text-sm">/{cmd.name}</span>
                      {cmd.permission !== "read" && (
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          cmd.permission === "admin" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"
                        )}>
                          {cmd.permission}
                        </span>
                      )}
                      <span className="text-zinc-500 text-xs truncate">{cmd.description}</span>
                    </div>
                    {cmd.params.length > 0 && (
                      <div className="text-zinc-600 text-xs font-mono mt-0.5">
                        {cmd.params.map(p => p.endsWith("?") ? `[${p.slice(0,-1)}]` : `<${p}>`).join(" ")}
                      </div>
                    )}
                  </div>
                  {i === selectedIndex && <kbd className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">Tab</kbd>}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-3 items-end p-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 focus-within:border-emerald-500/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type / for commands or ask anything..."
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-zinc-500 focus:outline-none resize-none text-sm py-2 px-1"
            style={{ minHeight: "24px", maxHeight: "150px" }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-2 text-xs text-zinc-600">
          <div className="flex gap-3">
            <span><kbd className="bg-zinc-800 px-1 rounded">/</kbd> commands</span>
            <span><kbd className="bg-zinc-800 px-1 rounded">Tab</kbd> complete</span>
            <span><kbd className="bg-zinc-800 px-1 rounded">↑↓</kbd> navigate</span>
          </div>
          <span>Powered by Groq</span>
        </div>
      </div>
    </div>
  );
}
