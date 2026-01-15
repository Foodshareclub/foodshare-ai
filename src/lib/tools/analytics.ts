import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Tool, ToolResult, daysSchema, toolError } from "./types";

export const analyticsTools: Tool[] = [
  {
    name: "stats",
    description: "Platform statistics and health overview",
    category: "analytics",
    permission: "read",
    cacheTtl: 30,
    params: [],
    schema: z.object({}),
    execute: async (_, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      
      const [reviews, scans, repos, queue, recentScores] = await Promise.all([
        supabase.from("reviews").select("id", { count: "exact", head: true }),
        supabase.from("security_scans").select("id", { count: "exact", head: true }),
        supabase.from("repo_configs").select("id, enabled"),
        supabase.from("review_queue").select("status"),
        supabase.from("reviews").select("score").not("score", "is", null).order("created_at", { ascending: false }).limit(100),
      ]);
      
      const queueData = queue.data || [];
      const pending = queueData.filter(j => j.status === "pending").length;
      const processing = queueData.filter(j => j.status === "processing").length;
      const failed = queueData.filter(j => j.status === "failed").length;
      
      const scores = recentScores.data?.map(r => r.score).filter((s): s is number => s != null) || [];
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      
      const enabledRepos = repos.data?.filter(r => r.enabled).length || 0;
      const healthStatus = failed > 10 ? "⚠️ Degraded" : processing > 20 ? "⚡ High Load" : "✓ Healthy";
      
      const output = `**Platform Statistics**

📊 **Overview**
• Total Reviews: ${reviews.count?.toLocaleString() || 0}
• Total Scans: ${scans.count?.toLocaleString() || 0}
• Repositories: ${repos.count || 0} (${enabledRepos} active)
• Avg Score: ${avg}/100

⚙️ **Queue Status**
• Pending: ${pending}
• Processing: ${processing}
• Failed: ${failed}

🏥 **Health:** ${healthStatus}`;
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime } };
    }
  },
  {
    name: "trends",
    description: "Review score trends over time",
    category: "analytics",
    permission: "read",
    cacheTtl: 120,
    params: [
      { name: "repo", required: false, description: "Filter by repository", type: "string" },
      { name: "days", required: false, description: "Days to analyze (1-365)", type: "number", default: "7" },
    ],
    schema: z.object({
      repo: z.string().optional(),
      days: daysSchema.optional(),
    }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const days = Math.min(parseInt(params.days || "7"), 365);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      let query = supabase
        .from("reviews")
        .select("repo_full_name, score, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      
      if (params.repo) query = query.ilike("repo_full_name", `%${params.repo}%`);
      
      const { data, error } = await query;
      if (error) return toolError("INTERNAL_ERROR", error.message);
      if (!data?.length) return { success: true, data: `No reviews in the last ${days} days.` };
      
      const scores = data.map(r => r.score).filter((s): s is number => s != null);
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const min = scores.length ? Math.min(...scores) : 0;
      const max = scores.length ? Math.max(...scores) : 0;
      
      const byRepo: Record<string, number[]> = {};
      data.forEach(r => {
        const name = r.repo_full_name;
        if (!byRepo[name]) byRepo[name] = [];
        if (r.score != null) byRepo[name].push(r.score);
      });
      
      const repoStats = Object.entries(byRepo)
        .map(([repo, s]) => ({
          repo,
          count: s.length,
          avg: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0,
        }))
        .sort((a, b) => b.count - a.count);
      
      const output = `**Trends: Last ${days} Days**
• Reviews: ${data.length}
• Average: ${avg}/100 (min: ${min}, max: ${max})

**By Repository:**
${repoStats.slice(0, 10).map(r => `• ${r.repo}: ${r.count} reviews, avg ${r.avg}/100`).join("\n")}`;
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length } };
    }
  },
  {
    name: "queue",
    description: "Job queue status and recent jobs",
    category: "queue",
    permission: "read",
    cacheTtl: 10,
    params: [],
    schema: z.object({}),
    execute: async (_, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("review_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      
      if (error) return toolError("INTERNAL_ERROR", error.message);
      if (!data?.length) return { success: true, data: "Queue is empty." };
      
      const counts = { pending: 0, processing: 0, failed: 0, completed: 0 };
      data.forEach(j => { counts[j.status as keyof typeof counts]++; });
      
      const output = `**Queue Status**
• Pending: ${counts.pending} | Processing: ${counts.processing} | Failed: ${counts.failed} | Completed: ${counts.completed}

**Recent Jobs:**
${data.slice(0, 12).map(j => {
  const icon = j.status === "completed" ? "✓" : j.status === "failed" ? "✗" : j.status === "processing" ? "⟳" : "○";
  const age = Math.floor((Date.now() - new Date(j.created_at).getTime()) / 60000);
  return `${icon} ${j.repo_full_name} PR#${j.pr_number} (${j.status}, ${age}m ago)${j.error ? `\n  └ ${j.error.slice(0, 50)}...` : ''}`;
}).join("\n")}`;
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length } };
    }
  },
  {
    name: "retry",
    description: "Retry failed jobs",
    category: "queue",
    permission: "write",
    params: [
      { name: "repo", required: false, description: "Filter by repository", type: "string" },
    ],
    schema: z.object({ repo: z.string().optional() }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      
      let query = supabase
        .from("review_queue")
        .update({ status: "pending", attempts: 0, error: null, updated_at: new Date().toISOString() })
        .eq("status", "failed");
      
      if (params.repo) query = query.ilike("repo_full_name", `%${params.repo}%`);
      
      const { data, error } = await query.select("id");
      if (error) return toolError("INTERNAL_ERROR", error.message);
      
      const count = data?.length || 0;
      return {
        success: true,
        data: count > 0 
          ? `✓ Reset ${count} failed job${count > 1 ? 's' : ''} to pending`
          : "No failed jobs to retry",
        metadata: { duration: Date.now() - ctx.startTime, recordsAffected: count }
      };
    }
  },
  {
    name: "clear-queue",
    description: "Clear completed/failed jobs from queue",
    category: "queue",
    permission: "admin",
    params: [
      { name: "status", required: true, description: "Status to clear", type: "string", enum: ["completed", "failed"] },
      { name: "confirm", required: true, description: "Type 'yes' to confirm", type: "string" },
    ],
    schema: z.object({
      status: z.enum(["completed", "failed"]),
      confirm: z.literal("yes"),
    }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      
      const { data, error } = await supabase
        .from("review_queue")
        .delete()
        .eq("status", params.status)
        .select("id");
      
      if (error) return toolError("INTERNAL_ERROR", error.message);
      
      const count = data?.length || 0;
      return {
        success: true,
        data: `✓ Cleared ${count} ${params.status} job${count !== 1 ? 's' : ''} from queue`,
        metadata: { duration: Date.now() - ctx.startTime, recordsAffected: count }
      };
    }
  },
];
