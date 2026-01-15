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
  category: ToolCategory;
  params: ToolParam[];
  schema: z.ZodObject<z.ZodRawShape>;
  permission: Permission;
  rateLimit?: { max: number; windowMs: number };
  cacheTtl?: number; // seconds
  execute: (params: Record<string, string>, ctx: ToolContext) => Promise<ToolResult>;
}

export type ToolCategory = "reviews" | "security" | "repos" | "queue" | "analytics" | "github" | "system";
export type Permission = "read" | "write" | "admin";

export interface ToolContext {
  userId?: string;
  correlationId: string;
  startTime: number;
  permissions: Permission[];
  ip?: string;
}

export interface ToolResult {
  success: boolean;
  data?: string;
  error?: string;
  code?: ErrorCode;
  metadata?: {
    duration: number;
    recordsAffected?: number;
    cached?: boolean;
    cacheHit?: boolean;
  };
}

export type ErrorCode = 
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "EXTERNAL_ERROR"
  | "INTERNAL_ERROR"
  | "CONFLICT";

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  params: string[];
  permission: Permission;
  examples?: string[];
}

export interface AuditEntry {
  timestamp: string;
  correlationId: string;
  tool: string;
  userId?: string;
  ip?: string;
  params: Record<string, string>;
  success: boolean;
  error?: string;
  duration: number;
}

// Validation schemas - Zod v4 syntax
export const repoSchema = z.string().min(3, "Repository name too short").regex(/^[\w.-]+\/[\w.-]+$/, "Format must be owner/repo");
export const depthSchema = z.enum(["quick", "standard", "deep"]).default("standard");
export const gradeSchema = z.enum(["A", "B", "C", "D", "F"]);
export const statusSchema = z.enum(["pending", "processing", "completed", "failed"]);
export const limitSchema = z.coerce.number().int().min(1).max(100).default(10);
export const daysSchema = z.coerce.number().int().min(1).max(365).default(7);
export const idSchema = z.string().min(4, "ID too short");
export const prSchema = z.coerce.number().int().positive("PR must be a positive number");
export const confirmSchema = z.literal("yes");

// Error factory
export function toolError(code: ErrorCode, message: string): ToolResult {
  return { success: false, error: message, code };
}
