import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Tool, ToolResult, repoSchema, depthSchema } from "./types";

export const repoTools: Tool[] = [
  {
    name: "repos",
    description: "List all configured repositories",
    category: "repos",
    params: [],
    schema: z.object({}),
    execute: async (_, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("repo_configs")
        .select("*")
        .order("repo_full_name");
      
      if (error) return { success: false, error: error.message };
      if (!data?.length) return { success: true, data: "No repositories configured." };
      
      const enabled = data.filter(r => r.enabled).length;
      const output = `**${data.length} Repositories** (${enabled} enabled)\n\n` + data.map(r => {
        const status = r.enabled ? "✓" : "✗";
        const auto = r.auto_review ? "auto" : "manual";
        return `${status} **${r.repo_full_name}**\n  depth: ${r.review_depth} | ${auto} | ignore: ${(r.ignore_patterns as string[])?.length || 0} patterns`;
      }).join("\n\n");
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length } };
    }
  },
  {
    name: "add-repo",
    description: "Add a repository to monitor",
    category: "repos",
    params: [
      { name: "repo", required: true, description: "Repository (owner/repo)", type: "string" },
      { name: "depth", required: false, description: "Review depth", type: "string", enum: ["quick", "standard", "deep"], default: "standard" },
      { name: "auto", required: false, description: "Auto-review PRs", type: "boolean", default: "false" },
    ],
    schema: z.object({
      repo: repoSchema,
      depth: depthSchema.optional(),
      auto: z.string().optional(),
    }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      
      // Check if already exists
      const { data: existing } = await supabase
        .from("repo_configs")
        .select("id")
        .eq("repo_full_name", params.repo)
        .single();
      
      if (existing) {
        return { success: false, error: `Repository ${params.repo} already configured` };
      }
      
      const { error } = await supabase.from("repo_configs").insert({
        repo_full_name: params.repo,
        enabled: true,
        review_depth: params.depth || "standard",
        auto_review: params.auto === "true",
      });
      
      if (error) return { success: false, error: error.message };
      
      return {
        success: true,
        data: `✓ Repository added\n• Name: ${params.repo}\n• Depth: ${params.depth || 'standard'}\n• Auto-review: ${params.auto === 'true' ? 'enabled' : 'disabled'}`,
        metadata: { duration: Date.now() - ctx.startTime, recordsAffected: 1 }
      };
    }
  },
  {
    name: "config-repo",
    description: "Update repository configuration",
    category: "repos",
    params: [
      { name: "repo", required: true, description: "Repository name", type: "string" },
      { name: "enabled", required: false, description: "Enable/disable", type: "boolean" },
      { name: "depth", required: false, description: "Review depth", type: "string", enum: ["quick", "standard", "deep"] },
      { name: "auto", required: false, description: "Auto-review PRs", type: "boolean" },
    ],
    schema: z.object({
      repo: z.string().min(1),
      enabled: z.string().optional(),
      depth: depthSchema.optional(),
      auto: z.string().optional(),
    }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const updates: Record<string, unknown> = {};
      
      if (params.enabled !== undefined) updates.enabled = params.enabled === "true";
      if (params.depth) updates.review_depth = params.depth;
      if (params.auto !== undefined) updates.auto_review = params.auto === "true";
      
      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No updates specified. Use: enabled, depth, or auto" };
      }
      
      const { data, error } = await supabase
        .from("repo_configs")
        .update(updates)
        .ilike("repo_full_name", `%${params.repo}%`)
        .select("repo_full_name");
      
      if (error) return { success: false, error: error.message };
      if (!data?.length) return { success: false, error: "Repository not found" };
      
      const repoName = data[0]?.repo_full_name || params.repo;
      return {
        success: true,
        data: `✓ Updated ${repoName}\n${Object.entries(updates).map(([k, v]) => `• ${k}: ${v}`).join("\n")}`,
        metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length }
      };
    }
  },
];
