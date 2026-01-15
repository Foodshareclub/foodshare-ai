import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Tool, ToolResult, limitSchema, statusSchema, depthSchema, repoSchema } from "./types";

export const reviewTools: Tool[] = [
  {
    name: "reviews",
    description: "List code reviews with filtering",
    category: "reviews",
    params: [
      { name: "repo", required: false, description: "Filter by repository", type: "string" },
      { name: "limit", required: false, description: "Results (1-100)", type: "number", default: "10" },
      { name: "status", required: false, description: "Filter by status", type: "string", enum: ["pending", "completed", "failed"] },
    ],
    schema: z.object({
      repo: z.string().optional(),
      limit: limitSchema.optional(),
      status: statusSchema.optional(),
    }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const limit = parseInt(params.limit || "10");
      
      let query = supabase
        .from("reviews")
        .select("id, repo_full_name, pr_number, summary, score, status, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 100));
      
      if (params.repo) query = query.ilike("repo_full_name", `%${params.repo}%`);
      if (params.status) query = query.eq("status", params.status);
      
      const { data, error } = await query;
      if (error) return { success: false, error: error.message };
      if (!data?.length) return { success: true, data: "No reviews found." };
      
      const output = `Found ${data.length} reviews:\n` + data.map(r => 
        `• [${r.id.slice(0,8)}] ${r.repo_full_name} PR#${r.pr_number}: ${r.score ?? '-'}/100 (${r.status})`
      ).join("\n");
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length } };
    }
  },
  {
    name: "review",
    description: "Get detailed review information",
    category: "reviews",
    params: [
      { name: "id", required: true, description: "Review ID (full or partial)", type: "string" },
    ],
    schema: z.object({ id: z.string().min(1) }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .ilike("id", `${params.id}%`)
        .limit(1)
        .single();
      
      if (error) return { success: false, error: error.code === "PGRST116" ? "Review not found" : error.message };
      
      const comments = (data.comments as Array<{body: string; severity: string; category: string}>) || [];
      const output = `**Review ${data.id.slice(0,8)}**
• Repository: ${data.repo_full_name}
• PR: #${data.pr_number}
• Score: ${data.score ?? 'N/A'}/100
• Status: ${data.status}
• Created: ${new Date(data.created_at).toLocaleString()}

**Summary:** ${data.summary || 'No summary'}

**Issues Found:** ${comments.length}
${comments.slice(0, 5).map(c => `  [${c.severity}] ${c.body?.slice(0, 100)}`).join("\n")}${comments.length > 5 ? `\n  ... and ${comments.length - 5} more` : ''}`;
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime } };
    }
  },
  {
    name: "trigger-review",
    description: "Queue a code review for a pull request",
    category: "reviews",
    params: [
      { name: "repo", required: true, description: "Repository (owner/repo)", type: "string" },
      { name: "pr", required: true, description: "PR number", type: "number" },
      { name: "depth", required: false, description: "Review depth", type: "string", enum: ["quick", "standard", "deep"], default: "standard" },
    ],
    schema: z.object({
      repo: repoSchema,
      pr: z.coerce.number().int().positive(),
      depth: depthSchema.optional(),
    }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      
      // Check for existing pending/processing job
      const { data: existing } = await supabase
        .from("review_queue")
        .select("id, status")
        .eq("repo_full_name", params.repo)
        .eq("pr_number", parseInt(params.pr || "0"))
        .in("status", ["pending", "processing"])
        .single();
      
      if (existing) {
        return { success: false, error: `Review already ${existing.status} (job: ${existing.id.slice(0,8)})` };
      }
      
      const { data, error } = await supabase
        .from("review_queue")
        .insert({
          repo_full_name: params.repo,
          pr_number: parseInt(params.pr || "0"),
          status: "pending",
          depth: params.depth || "standard",
          attempts: 0,
        })
        .select("id")
        .single();
      
      if (error) return { success: false, error: error.message };
      
      return {
        success: true,
        data: `✓ Review queued successfully\n• Repository: ${params.repo}\n• PR: #${params.pr}\n• Depth: ${params.depth || 'standard'}\n• Job ID: ${data.id.slice(0,8)}`,
        metadata: { duration: Date.now() - ctx.startTime, recordsAffected: 1 }
      };
    }
  },
];
