import { NextRequest } from "next/server";
import { pr } from "@/lib/github";
import { ok, err, handleError } from "@/lib/api";
import { getRepoPRs, getAllPRs } from "@/lib/pr-store";
import { getToolDisplayLabel, getToolEmoji } from "@/lib/llm-detection";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const state = (searchParams.get("state") || "open") as "open" | "closed" | "merged" | "all";
    const source = searchParams.get("source") || "github";
    const llmOnly = searchParams.get("llm_only") === "true";
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    // Source: database - read from stored PRs
    if (source === "db") {
      if (owner && repo) {
        const repoFullName = `${owner}/${repo}`;
        const data = await getRepoPRs(repoFullName, { state, llmOnly, limit });
        const pulls = data.map(p => ({
          number: p.number,
          title: p.title,
          state: p.github_merged_at ? "merged" : p.state,
          user: p.author_login,
          user_type: p.author_type,
          created_at: p.github_created_at,
          url: p.html_url,
          additions: p.additions,
          deletions: p.deletions,
          changed_files: p.changed_files,
          is_llm_generated: p.is_llm_generated,
          llm_tool: p.llm_tool,
          llm_tool_display: p.llm_tool ? getToolDisplayLabel(p.llm_tool) : null,
          llm_tool_emoji: p.llm_tool ? getToolEmoji(p.llm_tool) : null,
          llm_confidence: p.llm_confidence,
          draft: p.draft,
          head_ref: p.head_ref,
          base_ref: p.base_ref,
          labels: p.labels,
        }));
        return ok({ pulls, source: "db" });
      } else {
        // All stored PRs
        const data = await getAllPRs({ state, llmOnly, limit });
        const pulls = data.map(p => ({
          repo: p.repo_full_name,
          number: p.number,
          title: p.title,
          state: p.github_merged_at ? "merged" : p.state,
          user: p.author_login,
          user_type: p.author_type,
          created_at: p.github_created_at,
          url: p.html_url,
          additions: p.additions,
          deletions: p.deletions,
          changed_files: p.changed_files,
          is_llm_generated: p.is_llm_generated,
          llm_tool: p.llm_tool,
          llm_tool_display: p.llm_tool ? getToolDisplayLabel(p.llm_tool) : null,
          llm_tool_emoji: p.llm_tool ? getToolEmoji(p.llm_tool) : null,
          llm_confidence: p.llm_confidence,
          draft: p.draft,
          head_ref: p.head_ref,
          base_ref: p.base_ref,
          labels: p.labels,
        }));
        return ok({ pulls, source: "db" });
      }
    }

    // Source: github - fetch live from GitHub API
    if (!owner || !repo) return err("Missing required params: owner, repo");

    const ghState = state === "merged" ? "closed" : state;
    const data = await pr.list(owner, repo, ghState as "open" | "closed" | "all") as Array<{
      number: number;
      title: string;
      merged_at?: string;
      state: string;
      user?: { login: string };
      created_at: string;
      html_url: string;
    }>;
    const pulls = data.map(p => ({
      number: p.number,
      title: p.title,
      state: p.merged_at ? "merged" : p.state,
      user: p.user?.login,
      created_at: p.created_at,
      url: p.html_url,
    }));

    return ok({ pulls, source: "github" });
  } catch (error) {
    return handleError(error);
  }
}
