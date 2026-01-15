import { describe, it, expect } from 'vitest';
import { reviewRequestSchema, repoConfigSchema, paginationSchema } from '../validation';

describe('Validation Schemas', () => {
  describe('reviewRequestSchema', () => {
    it('should validate correct review request', () => {
      const data = {
        owner: 'test-owner',
        repo: 'test-repo',
        prNumber: 123,
        depth: 'standard' as const,
      };
      
      const result = reviewRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid PR number', () => {
      const data = {
        owner: 'test-owner',
        repo: 'test-repo',
        prNumber: -1,
      };
      
      const result = reviewRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject empty owner', () => {
      const data = {
        owner: '',
        repo: 'test-repo',
        prNumber: 123,
      };
      
      const result = reviewRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('should apply defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should enforce max limit', () => {
      const result = paginationSchema.safeParse({ limit: 200 });
      expect(result.success).toBe(false);
    });
  });

  describe('repoConfigSchema', () => {
    it('should validate repo config', () => {
      const data = {
        full_name: 'owner/repo',
        categories: ['security', 'performance'],
        ignore_paths: ['*.test.ts'],
        enabled: true,
      };
      
      const result = repoConfigSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});
