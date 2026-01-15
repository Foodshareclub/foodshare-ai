import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Tool, ToolResult, limitSchema, gradeSchema, repoSchema } from "./types";

export const securityTools: Tool[] = [
  {
    name: "scans",
    description: "List security scans with filtering",
    category: "security",
    params: [
      { name: "repo", required: false, description: "Filter by repository", type: "string" },
      { name: "limit", required: false, description: "Results (1-100)", type: "number", default: "10" },
      { name: "grade", required: false, description: "Filter by grade", type: "string", enum: ["A", "B", "C", "D", "F"] },
    ],
    schema: z.object({
      repo: z.string().optional(),
      limit: limitSchema.optional(),
      grade: gradeSchema.optional(),
    }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const limit = parseInt(params.limit || "10");
      
      let query = supabase
        .from("security_scans")
        .select("id, repo_full_name, score, grade, critical_count, high_count, medium_count, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(limit, 100));
      
      if (params.repo) query = query.ilike("repo_full_name", `%${params.repo}%`);
      if (params.grade) query = query.eq("grade", params.grade.toUpperCase());
      
      const { data, error } = await query;
      if (error) return { success: false, error: error.message };
      if (!data?.length) return { success: true, data: "No scans found." };
      
      const output = `Found ${data.length} scans:\n` + data.map(s => 
        `• ${s.repo_full_name}: Grade ${s.grade} (${s.score}/100) - 🔴${s.critical_count} 🟠${s.high_count} 🟡${s.medium_count}`
      ).join("\n");
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length } };
    }
  },
  {
    name: "scan",
    description: "Get detailed security scan findings",
    category: "security",
    params: [
      { name: "repo", required: true, description: "Repository name", type: "string" },
    ],
    schema: z.object({ repo: z.string().min(1) }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("security_scans")
        .select("*")
        .ilike("repo_full_name", `%${params.repo}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (error) return { success: false, error: error.code === "PGRST116" ? "No scan found for this repo" : error.message };
      
      const findings = (data.findings as Array<{title: string; severity: string; description: string}>) || [];
      const output = `**Security Scan: ${data.repo_full_name}**
• Grade: ${data.grade} (${data.score}/100)
• Critical: ${data.critical_count} | High: ${data.high_count} | Medium: ${data.medium_count}
• Scanned: ${new Date(data.created_at).toLocaleString()}

**Top Findings:**
${findings.slice(0, 8).map(f => `  [${f.severity.toUpperCase()}] ${f.title}`).join("\n") || "  No findings"}`;
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime } };
    }
  },
  {
    name: "trigger-scan",
    description: "Trigger a security scan for a repository",
    category: "security",
    params: [
      { name: "repo", required: true, description: "Repository (owner/repo)", type: "string" },
    ],
    schema: z.object({ repo: repoSchema }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const cronSecret = process.env.CRON_SECRET;
      
      if (!supabaseUrl || !cronSecret) {
        return { success: false, error: "Scan service not configured" };
      }
      
      const repo = params.repo;
      if (!repo) {
        return { success: false, error: "Repository required" };
      }
      
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/scan-repos?repo=${encodeURIComponent(repo)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cronSecret}` },
        });
        
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { success: false, error: `Scan failed (${res.status}): ${text || res.statusText}` };
        }
        
        return {
          success: true,
          data: `✓ Security scan triggered\n• Repository: ${params.repo}\n• Status: Processing\n• ETA: 1-2 minutes`,
          metadata: { duration: Date.now() - ctx.startTime }
        };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Network error" };
      }
    }
  },
];
