import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Tool, ToolResult, repoSchema, depthSchema, toolError } from "./types";

export const repoTools: Tool[] = [
  {
    name: "repos",
    description: "List all configured repositories",
    category: "repos",
    permission: "read",
    cacheTtl: 60,
    params: [],
    schema: z.object({}),
    execute: async (_, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("repo_configs")
        .select("*")
        .order("full_name");
      
      if (error) return toolError("INTERNAL_ERROR", error.message);
      if (!data?.length) return { success: true, data: "No repositories configured." };
      
      const enabled = data.filter(r => r.enabled).length;
      const output = `**${data.length} Repositories** (${enabled} enabled)\n\n` + data.map(r => {
        const status = r.enabled ? "✓" : "✗";
        const auto = r.auto_review ? "auto" : "manual";
        const name = r.repo_full_name || r.full_name;
        const depth = r.review_depth || "standard";
        const ignoreCount = (r.ignore_patterns as string[])?.length || (r.ignore_paths as string[])?.length || 0;
        return `${status} **${name}**\n  depth: ${depth} | ${auto} | ignore: ${ignoreCount} patterns`;
      }).join("\n\n");
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length } };
    }
  },
  {
    name: "add-repo",
    description: "Add a repository to monitor",
    category: "repos",
    permission: "write",
    rateLimit: { max: 10, windowMs: 60000 },
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
      
      // Check if already exists (check both column names)
      const { data: existing } = await supabase
        .from("repo_configs")
        .select("id")
        .or(`full_name.eq.${params.repo},repo_full_name.eq.${params.repo}`)
        .single();
      
      if (existing) {
        return toolError("CONFLICT", `Repository ${params.repo} already configured`);
      }
      
      const { error } = await supabase.from("repo_configs").insert({
        full_name: params.repo,
        repo_full_name: params.repo,
        enabled: true,
        review_depth: params.depth || "standard",
        auto_review: params.auto === "true",
        created_by: ctx.userId,
      });
      
      if (error) return toolError("INTERNAL_ERROR", error.message);
      
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
    permission: "write",
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
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      
      if (params.enabled !== undefined) updates.enabled = params.enabled === "true";
      if (params.depth) updates.review_depth = params.depth;
      if (params.auto !== undefined) updates.auto_review = params.auto === "true";
      
      if (Object.keys(updates).length === 1) {
        return toolError("VALIDATION_ERROR", "No updates specified. Use: enabled, depth, or auto");
      }
      
      // Try both column names for matching
      const { data, error } = await supabase
        .from("repo_configs")
        .update(updates)
        .or(`full_name.ilike.%${params.repo}%,repo_full_name.ilike.%${params.repo}%`)
        .select("full_name, repo_full_name");
      
      if (error) return toolError("INTERNAL_ERROR", error.message);
      if (!data?.length) return toolError("NOT_FOUND", "Repository not found");
      
      const repoName = data[0]?.repo_full_name || data[0]?.full_name || params.repo;
      const changes = Object.entries(updates).filter(([k]) => k !== "updated_at");
      
      return {
        success: true,
        data: `✓ Updated ${repoName}\n${changes.map(([k, v]) => `• ${k}: ${v}`).join("\n")}`,
        metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length }
      };
    }
  },
  {
    name: "remove-repo",
    description: "Remove a repository from monitoring",
    category: "repos",
    permission: "admin",
    params: [
      { name: "repo", required: true, description: "Repository name", type: "string" },
      { name: "confirm", required: true, description: "Type 'yes' to confirm", type: "string" },
    ],
    schema: z.object({
      repo: z.string().min(1),
      confirm: z.literal("yes"),
    }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      
      const { data, error } = await supabase
        .from("repo_configs")
        .delete()
        .or(`full_name.ilike.%${params.repo}%,repo_full_name.ilike.%${params.repo}%`)
        .select("full_name, repo_full_name");
      
      if (error) return toolError("INTERNAL_ERROR", error.message);
      if (!data?.length) return toolError("NOT_FOUND", "Repository not found");
      
      return {
        success: true,
        data: `✓ Removed ${data[0]?.repo_full_name || data[0]?.full_name || params.repo} from monitoring`,
        metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length }
      };
    }
  },
];
