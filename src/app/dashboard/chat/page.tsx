"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

function formatMarkdown(text: string) {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-black/50 p-3 rounded-lg text-xs overflow-x-auto my-3 border border-zinc-700 font-mono"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-700/50 px-1.5 py-0.5 rounded text-emerald-400 text-xs font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4">$1. $2</li>')
    .replace(/\n/g, '<br/>');
}

function TimeAgo({ date }: { date: Date }) {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return <span>just now</span>;
  if (seconds < 3600) return <span>{Math.floor(seconds / 60)}m ago</span>;
  return <span>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const sendMessage = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = 'auto';
    
    const userMessage: ChatMessage = { 
      id: crypto.randomUUID(), 
      role: "user", 
      content: userMsg, 
      timestamp: new Date() 
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: newMessages.slice(-10) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: "assistant", 
        content: data.response || "Sorry, I couldn't process that.", 
        timestamp: new Date() 
      }]);
    } catch {
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: "assistant", 
        content: "Error connecting to AI. Please try again.", 
        timestamp: new Date() 
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestions = [
    { icon: "🔒", title: "Security Audit", text: "What security vulnerabilities should I look for?" },
    { icon: "⚡", title: "Performance", text: "How can I optimize my application performance?" },
    { icon: "📊", title: "Code Quality", text: "Analyze my recent review scores" },
    { icon: "🐛", title: "Bug Prevention", text: "Common bug patterns to avoid" },
    { icon: "🏗️", title: "Architecture", text: "Best practices for code structure" },
    { icon: "🧪", title: "Testing", text: "How should I structure my tests?" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <span className="text-xl">🤖</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">AI Assistant</h1>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online • Ready to help
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <>
              <span className="text-xs text-zinc-600">{messages.length} messages</span>
              <button 
                onClick={() => setMessages([])} 
                className="text-sm text-zinc-500 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/50 to-zinc-900 p-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 flex items-center justify-center mb-6 border border-emerald-500/20">
              <span className="text-4xl">💬</span>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">How can I help you?</h2>
            <p className="text-zinc-500 text-sm mb-8 text-center max-w-md">
              Ask about code reviews, security, performance, or any development questions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s.text)}
                  className="group flex flex-col items-start gap-2 p-4 rounded-xl bg-zinc-800/30 border border-zinc-700/50 hover:bg-zinc-800/70 hover:border-emerald-500/30 transition-all text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-sm font-medium text-white">{s.title}</span>
                  </div>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-400">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🤖</span>
                  </div>
                )}
                <div className={cn("max-w-[75%] group", msg.role === "user" ? "order-first" : "")}>
                  <div className={cn(
                    "text-sm p-4 rounded-2xl relative",
                    msg.role === "user" 
                      ? "bg-emerald-500 text-white rounded-tr-md" 
                      : "bg-zinc-800/80 text-zinc-200 rounded-tl-md border border-zinc-700/50"
                  )}>
                    {msg.role === "assistant" ? (
                      <div dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  <div className={cn("flex items-center gap-2 mt-1 px-1", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <span className="text-xs text-zinc-600"><TimeAgo date={msg.timestamp} /></span>
                    {msg.role === "assistant" && (
                      <button 
                        onClick={() => copyToClipboard(msg.content, msg.id)}
                        className="text-xs text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {copied === msg.id ? "✓ Copied" : "Copy"}
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
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">🤖</span>
                </div>
                <div className="bg-zinc-800/80 text-zinc-400 text-sm p-4 rounded-2xl rounded-tl-md border border-zinc-700/50">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                    <span className="text-xs text-zinc-500">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-4">
        <div className="flex gap-3 items-end p-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 focus-within:border-emerald-500/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
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
        <div className="flex items-center justify-between mt-2 px-2">
          <p className="text-xs text-zinc-600">Enter to send • Shift+Enter for new line</p>
          <p className="text-xs text-zinc-600">Powered by Groq</p>
        </div>
      </div>
    </div>
  );
}
