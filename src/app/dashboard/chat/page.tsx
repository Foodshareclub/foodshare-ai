"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function formatMarkdown(text: string) {
  return text
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-zinc-900 p-3 rounded-lg text-xs overflow-x-auto my-2 border border-zinc-700"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-700 px-1.5 py-0.5 rounded text-xs">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (text?: string) => {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: newMessages.slice(-10) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.response || "Sorry, I couldn't process that." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error connecting to AI. Please try again." }]);
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
    { icon: "🔒", text: "What security vulnerabilities should I look for in my code?" },
    { icon: "⚡", text: "How can I improve the performance of my application?" },
    { icon: "📊", text: "Analyze my recent code review scores and suggest improvements" },
    { icon: "🐛", text: "What are common bug patterns I should avoid?" },
    { icon: "🏗️", text: "Best practices for code architecture" },
    { icon: "🧪", text: "How should I structure my tests?" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Assistant</h1>
          <p className="text-zinc-500 text-sm">Ask anything about code reviews, security, and best practices</p>
        </div>
        {messages.length > 0 && (
          <button 
            onClick={() => setMessages([])} 
            className="text-sm text-zinc-500 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Clear chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-xl font-semibold text-white mb-2">How can I help you today?</h2>
            <p className="text-zinc-500 text-sm mb-8 text-center max-w-md">
              I can help with code reviews, security analysis, performance optimization, and best practices.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s.text)}
                  className="flex items-start gap-3 text-left p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-zinc-600 transition-all"
                >
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-sm">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] text-sm p-4 rounded-2xl",
                  msg.role === "user" 
                    ? "bg-emerald-500 text-white rounded-br-md" 
                    : "bg-zinc-800 text-zinc-200 rounded-bl-md"
                )}>
                  {msg.role === "assistant" ? (
                    <div 
                      className="prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} 
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 text-zinc-400 text-sm p-4 rounded-2xl rounded-bl-md">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex gap-3 items-end p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your code..."
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-zinc-500 focus:outline-none resize-none text-sm"
            style={{ minHeight: "24px", maxHeight: "120px" }}
          />
          <button 
            onClick={() => sendMessage()} 
            disabled={loading || !input.trim()} 
            className="p-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-2 text-center">Press Enter to send • Shift+Enter for new line</p>
      </div>
    </div>
  );
}
