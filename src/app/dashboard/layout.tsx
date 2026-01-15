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

function ChatPanel({ onClose }: { onClose: () => void }) {
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
    const newMessages = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: newMessages.slice(-6) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response || "Sorry, I couldn't process that." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error connecting to AI." }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    "What security issues should I watch for?",
    "How can I improve code performance?",
    "Explain my recent review scores",
  ];

  return (
    <aside className="w-96 flex-shrink-0 border-l border-zinc-800 bg-zinc-900 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="font-medium text-white flex items-center gap-2">💬 AI Assistant</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setMessages([])} className="text-xs text-zinc-500 hover:text-white">Clear</button>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400 text-center">How can I help you today?</p>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(s); }}
                  className="w-full text-left text-xs p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("text-sm p-3 rounded-lg whitespace-pre-wrap", msg.role === "user" ? "bg-emerald-500/20 text-emerald-300 ml-6" : "bg-zinc-800 text-zinc-300 mr-2")}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-zinc-500 p-3">
            <span className="animate-spin">⚡</span> Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Ask AI..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
          <button onClick={sendMessage} disabled={loading} className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm hover:bg-emerald-600 disabled:opacity-50">
            Send
          </button>
        </div>
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
