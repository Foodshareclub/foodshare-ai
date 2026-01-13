"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/reviews", label: "Review History", icon: "📝" },
  { href: "/dashboard/repos", label: "Repositories", icon: "📁" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stats, setStats] = useState({ reviews: 0, repos: 0 });

  useEffect(() => {
    fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900/50">
        <div className="p-6 border-b border-zinc-800">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">AI</div>
            <div>
              <h1 className="font-semibold text-white">FoodShare AI</h1>
              <p className="text-xs text-zinc-500">Code Review</p>
            </div>
          </Link>
        </div>
        
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                pathname === item.href
                  ? "bg-emerald-500/10 text-emerald-400 font-medium"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 w-64 p-4 border-t border-zinc-800">
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

      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
