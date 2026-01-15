import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Tool, ToolResult, limitSchema, gradeSchema, repoSchema, toolError } from "./types";

export const securityTools: Tool[] = [
  {
    name: "scans",
    description: "List security scans with filtering",
    category: "security",
    permission: "read",
    cacheTtl: 30,
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
      const limit = Math.min(parseInt(params.limit || "10"), 100);
      
      let query = supabase
        .from("security_scans")
        .select("id, repo_full_name, score, security_score, grade, critical_count, high_count, medium_count, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      
      if (params.repo) query = query.ilike("repo_full_name", `%${params.repo}%`);
      if (params.grade) query = query.eq("grade", params.grade.toUpperCase());
      
      const { data, error } = await query;
      if (error) return toolError("INTERNAL_ERROR", error.message);
      if (!data?.length) return { success: true, data: "No scans found." };
      
      const output = `Found ${data.length} scans:\n` + data.map(s => {
        const score = s.score ?? s.security_score ?? 0;
        const grade = s.grade || (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F');
        return `• ${s.repo_full_name}: Grade ${grade} (${score}/100) - 🔴${s.critical_count || 0} 🟠${s.high_count || 0} 🟡${s.medium_count || 0}`;
      }).join("\n");
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime, recordsAffected: data.length } };
    }
  },
  {
    name: "scan",
    description: "Get detailed security scan findings",
    category: "security",
    permission: "read",
    cacheTtl: 60,
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
      
      if (error?.code === "PGRST116") return toolError("NOT_FOUND", "No scan found for this repository");
      if (error) return toolError("INTERNAL_ERROR", error.message);
      
      const score = data.score ?? data.security_score ?? 0;
      const grade = data.grade || (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F');
      const findings = (data.findings || data.issues || []) as Array<{title: string; severity: string; description: string}>;
      
      const output = `**Security Scan: ${data.repo_full_name}**
• Grade: ${grade} (${score}/100)
• Critical: ${data.critical_count || 0} | High: ${data.high_count || 0} | Medium: ${data.medium_count || 0}
• Scanned: ${new Date(data.created_at).toLocaleString()}

**Top Findings:**
${findings.slice(0, 8).map(f => `  [${(f.severity || 'medium').toUpperCase()}] ${f.title || f.description?.slice(0, 60) || 'Issue'}`).join("\n") || "  No findings"}`;
      
      return { success: true, data: output, metadata: { duration: Date.now() - ctx.startTime } };
    }
  },
  {
    name: "trigger-scan",
    description: "Trigger a security scan for a repository",
    category: "security",
    permission: "write",
    rateLimit: { max: 5, windowMs: 60000 },
    params: [
      { name: "repo", required: true, description: "Repository (owner/repo)", type: "string" },
    ],
    schema: z.object({ repo: repoSchema }),
    execute: async (params, ctx): Promise<ToolResult> => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const cronSecret = process.env.CRON_SECRET;
      
      if (!supabaseUrl || !cronSecret) {
        return toolError("INTERNAL_ERROR", "Scan service not configured");
      }
      
      const repo = params.repo;
      if (!repo) return toolError("VALIDATION_ERROR", "Repository required");
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        const res = await fetch(`${supabaseUrl}/functions/v1/scan-repos?repo=${encodeURIComponent(repo)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cronSecret}` },
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (res.status === 404) return toolError("NOT_FOUND", "Repository not found");
        if (res.status === 429) return toolError("RATE_LIMITED", "Scan service rate limited");
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return toolError("EXTERNAL_ERROR", `Scan failed (${res.status}): ${text || res.statusText}`);
        }
        
        return {
          success: true,
          data: `✓ Security scan triggered\n• Repository: ${repo}\n• Status: Processing\n• ETA: 1-2 minutes`,
          metadata: { duration: Date.now() - ctx.startTime }
        };
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          return toolError("EXTERNAL_ERROR", "Scan request timed out");
        }
        return toolError("EXTERNAL_ERROR", e instanceof Error ? e.message : "Network error");
      }
    }
  },
];
