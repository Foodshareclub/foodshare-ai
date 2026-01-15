import { z } from "zod";

export interface ToolParam {
  name: string;
  required: boolean;
  description: string;
  type: "string" | "number" | "boolean";
  enum?: string[];
  default?: string;
}

export interface Tool {
  name: string;
  description: string;
  category: "reviews" | "security" | "repos" | "queue" | "analytics" | "github" | "system";
  params: ToolParam[];
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (params: Record<string, string>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  userId?: string;
  correlationId: string;
  startTime: number;
}

export interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
  metadata?: {
    duration: number;
    recordsAffected?: number;
    cached?: boolean;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  params: string[];
  examples?: string[];
}

// Validation schemas
export const repoSchema = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "Format: owner/repo");
export const depthSchema = z.enum(["quick", "standard", "deep"]).default("standard");
export const gradeSchema = z.enum(["A", "B", "C", "D", "F"]);
export const statusSchema = z.enum(["pending", "processing", "completed", "failed"]);
export const limitSchema = z.coerce.number().int().min(1).max(100).default(10);
export const daysSchema = z.coerce.number().int().min(1).max(365).default(7);
export const boolSchema = z.enum(["true", "false"]).transform(v => v === "true");
