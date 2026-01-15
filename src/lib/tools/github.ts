import { z } from "zod";
import { Tool, ToolResult, repoSchema, toolError } from "./types";

export const githubTools: Tool[] = [
  {
    name: "prs",
    description: "List open pull requests from GitHub",
    category: "github",
    permission: "read",
    cacheTtl: 60,
    rateLimit: { max: 30, windowMs: 60000 },
    params: [
      { name: "repo", required: true, description: "Repository (owner/repo)", type: "string" },
    ],
    schema: z.object({ repo: repoSchema }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const token = process.env.GITHUB_TOKEN;
      if (!token) return toolError("INTERNAL_ERROR", "GitHub token not configured");
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const res = await fetch(`https://api.github.com/repos/${params.repo}/pulls?state=open&per_page=15`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (res.status === 404) return toolError("NOT_FOUND", "Repository not found");
        if (res.status === 403) {
          const remaining = res.headers.get("x-ratelimit-remaining");
          if (remaining === "0") return toolError("RATE_LIMITED", "GitHub API rate limit exceeded");
          return toolError("PERMISSION_DENIED", "Access denied to repository");
        }
        if (!res.ok) return toolError("EXTERNAL_ERROR", `GitHub API error: ${res.status}`);
        
        const prs = await res.json();
        if (!prs.length) return { success: true, data: `No open PRs in ${params.repo}` };
        
        const output = `**Open PRs in ${params.repo}** (${prs.length})\n\n` + 
          prs.map((pr: { number: number; title: string; user: { login: string }; draft: boolean; created_at: string; labels: Array<{name: string}> }) => {
            const draft = pr.draft ? " [DRAFT]" : "";
            const age = Math.floor((Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24));
            const labels = pr.labels?.slice(0, 3).map(l => l.name).join(", ");
            return `• #${pr.number}${draft}: ${pr.title}\n  by ${pr.user.login} • ${age}d ago${labels ? ` • ${labels}` : ''}`;
          }).join("\n\n");
        
        return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: prs.length } };
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          return toolError("EXTERNAL_ERROR", "GitHub request timed out");
        }
        return toolError("EXTERNAL_ERROR", e instanceof Error ? e.message : "Network error");
      }
    }
  },
];
