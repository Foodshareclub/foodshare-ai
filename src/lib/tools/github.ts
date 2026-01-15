import { z } from "zod";
import { Tool, ToolResult, repoSchema } from "./types";

export const githubTools: Tool[] = [
  {
    name: "prs",
    description: "List open pull requests from GitHub",
    category: "github",
    params: [
      { name: "repo", required: true, description: "Repository (owner/repo)", type: "string" },
    ],
    schema: z.object({ repo: repoSchema }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const token = process.env.GITHUB_TOKEN;
      if (!token) return { success: false, error: "GitHub token not configured" };
      
      try {
        const res = await fetch(`https://api.github.com/repos/${params.repo}/pulls?state=open&per_page=15`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        
        if (res.status === 404) return { success: false, error: "Repository not found" };
        if (res.status === 403) return { success: false, error: "Rate limited or access denied" };
        if (!res.ok) return { success: false, error: `GitHub API error: ${res.status}` };
        
        const prs = await res.json();
        if (!prs.length) return { success: true, data: `No open PRs in ${params.repo}` };
        
        const output = `**Open PRs in ${params.repo}** (${prs.length})\n\n` + 
          prs.map((pr: { number: number; title: string; user: { login: string }; draft: boolean; created_at: string }) => {
            const draft = pr.draft ? " [DRAFT]" : "";
            const age = Math.floor((Date.now() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24));
            return `• #${pr.number}${draft}: ${pr.title}\n  by ${pr.user.login} • ${age}d ago`;
          }).join("\n\n");
        
        return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: prs.length } };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Network error" };
      }
    }
  },
];
