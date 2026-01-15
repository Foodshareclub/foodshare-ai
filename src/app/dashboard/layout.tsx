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
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function SidebarChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response || "Sorry, I couldn't process that." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error connecting to AI." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 w-full"
      >
        <span>💬</span>
        AI Chat
      </button>
    );
  }

  return (
    <div className="flex flex-col h-64 border border-zinc-700 rounded-lg bg-zinc-800/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700 bg-zinc-800">
        <span className="text-sm font-medium text-white">💬 AI Chat</span>
        <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white text-xs">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-zinc-500 text-center py-4">Ask about code reviews, security, or your repos...</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("text-xs p-2 rounded", msg.role === "user" ? "bg-emerald-500/20 text-emerald-300 ml-4" : "bg-zinc-700 text-zinc-300 mr-4")}>
            {msg.content}
          </div>
        ))}
        {loading && <div className="text-xs text-zinc-500 animate-pulse">Thinking...</div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-2 border-t border-zinc-700">
        <div className="flex gap-1">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Ask AI..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
          <button onClick={sendMessage} disabled={loading} className="px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600 disabled:opacity-50">
            →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stats, setStats] = useState({ reviews: 0, repos: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-white p-2">
          {mobileMenuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar - fixed, no scroll */}
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
          <div className="pt-2">
            <SidebarChat />
          </div>
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

      {/* Main content - scrollable */}
      <main className="flex-1 overflow-y-auto pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
