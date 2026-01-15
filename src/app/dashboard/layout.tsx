"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/reviews", label: "Reviews", icon: "📝" },
  { href: "/dashboard/scans", label: "Security Scans", icon: "🛡️" },
  { href: "/dashboard/repos", label: "Repos", icon: "📁" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📈" },
  { href: "/dashboard/chat", label: "AI Chat", icon: "💬" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

function formatMarkdown(text: string) {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-zinc-900 p-2 rounded text-xs overflow-x-auto my-2"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-700 px-1 rounded text-xs">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user" as const, content: userMsg, timestamp: new Date() }];
    setMessages(newMessages);
    setLoading(true);
    setStreaming("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: newMessages.slice(-8) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response || "Sorry, I couldn't process that.", timestamp: new Date() }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error connecting to AI. Please try again.", timestamp: new Date() }]);
    } finally {
      setLoading(false);
      setStreaming("");
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
    { icon: "🔒", text: "Security best practices" },
    { icon: "⚡", text: "Performance tips" },
    { icon: "📊", text: "Explain my review scores" },
    { icon: "🐛", text: "Common bug patterns" },
  ];

  return (
    <aside className="w-[420px] flex-shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-white">AI Assistant</span>
        </div>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="text-xs text-zinc-500 hover:text-white transition-colors">
              Clear chat
            </button>
          )}
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <div className="text-3xl mb-2">🤖</div>
              <p className="text-sm text-zinc-300">Hi! I&apos;m your code review assistant.</p>
              <p className="text-xs text-zinc-500 mt-1">Ask me anything about your code.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s.text)}
                  className="flex items-center gap-2 text-left text-xs p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-white hover:border-zinc-600 transition-all"
                >
                  <span>{s.icon}</span>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] text-sm p-3 rounded-2xl",
              msg.role === "user" 
                ? "bg-emerald-500 text-white rounded-br-md" 
                : "bg-zinc-800 text-zinc-200 rounded-bl-md"
            )}>
              {msg.role === "assistant" ? (
                <div dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 text-zinc-400 text-sm p-3 rounded-2xl rounded-bl-md">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-4 border-t border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 resize-none max-h-32"
            style={{ minHeight: "44px" }}
          />
          <button 
            onClick={() => sendMessage()} 
            disabled={loading || !input.trim()} 
            className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-2 text-center">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </aside>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stats, setStats] = useState({ reviews: 0, repos: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">AI</div>
          <span className="font-semibold text-white">FoodShare AI</span>
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={() => setChatOpen(!chatOpen)} className="text-white p-2">💬</button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white p-2">
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Left Sidebar */}
      <aside className={cn(
        "fixed md:relative inset-y-0 left-0 z-40 w-64 flex-shrink-0 border-r border-zinc-800 bg-zinc-900 flex flex-col transform transition-transform md:transform-none",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 border-b border-zinc-800 hidden md:block">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">AI</div>
            <div>
              <h1 className="font-semibold text-white">FoodShare AI</h1>
              <p className="text-xs text-zinc-500">Code Review</p>
            </div>
          </Link>
        </div>
        
        <nav className="p-4 space-y-1 mt-16 md:mt-0 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                pathname === item.href
                  ? "bg-emerald-500/10 text-emerald-400 font-medium"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full",
              chatOpen ? "bg-emerald-500/10 text-emerald-400 font-medium" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            )}
          >
            <span>💬</span>
            AI Chat
          </button>
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2 rounded-lg bg-zinc-800/50">
              <div className="text-lg font-bold text-white">{stats.reviews}</div>
              <div className="text-xs text-zinc-500">Reviews</div>
            </div>
            <div className="p-2 rounded-lg bg-zinc-800/50">
              <div className="text-lg font-bold text-white">{stats.repos}</div>
              <div className="text-xs text-zinc-500">Repos</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-6xl">{children}</div>
      </main>

      {/* Right Chat Panel */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </div>
  );
}
