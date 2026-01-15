import { z } from 'zod';

// Common schemas
export const idSchema = z.string().uuid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Review schemas
export const reviewRequestSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  prNumber: z.number().int().positive(),
  depth: z.enum(['quick', 'standard', 'thorough']).optional(),
});

export const batchReviewSchema = z.object({
  reviews: z.array(reviewRequestSchema).min(1).max(10),
});

// Repo config schemas
export const repoConfigSchema = z.object({
  full_name: z.string().min(1),
  categories: z.array(z.string()).optional(),
  ignore_paths: z.array(z.string()).optional(),
  custom_instructions: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const updateRepoConfigSchema = repoConfigSchema.partial().omit({ full_name: true });

// Webhook schemas
export const githubWebhookSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number(),
    state: z.string(),
    head: z.object({
      sha: z.string(),
    }),
  }).optional(),
  repository: z.object({
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
    name: z.string(),
  }),
});

// Analytics schemas
export const analyticsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  repo: z.string().optional(),
});

// Job schemas
export const jobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export type BatchReviewRequest = z.infer<typeof batchReviewSchema>;
export type RepoConfig = z.infer<typeof repoConfigSchema>;
export type UpdateRepoConfig = z.infer<typeof updateRepoConfigSchema>;
export type GithubWebhook = z.infer<typeof githubWebhookSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
