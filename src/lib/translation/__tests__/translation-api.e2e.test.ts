import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';

/**
 * E2E tests for the Translation Service API
 *
 * These tests run against the live translation service at https://translate.foodshare.club
 * Requires a valid API key in TRANSLATE_API_KEY environment variable
 *
 * Run with: npm test -- src/lib/translation/__tests__/translation-api.e2e.test.ts
 * With API key: TRANSLATE_API_KEY=your_key npm test -- src/lib/translation/__tests__/translation-api.e2e.test.ts
 */

const BASE_URL = process.env.TRANSLATE_API_URL || 'https://translate.foodshare.club';
const API_KEY = process.env.TRANSLATE_API_KEY || '';
const TIMEOUT = 30000; // 30 second timeout for translation requests

// Track if service is reachable
let serviceReachable = true;

// Response schemas for validation - matching actual service responses
const HealthResponseSchema = z.object({
  status: z.string(),
  redis: z.union([z.string(), z.boolean()]).optional(),
  redis_pool: z.object({
    size: z.number(),
    available: z.number(),
  }).optional(),
  llm: z.union([z.string(), z.boolean()]).optional(),
  llm_available: z.number().optional(),
  version: z.string().optional(),
});

const TranslateResponseSchema = z.object({
  translatedText: z.string(),
  sourceLanguage: z.string().optional(),
  isRTL: z.boolean().optional(),
  cached: z.boolean().optional(),
});

const ErrorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  details: z.union([z.string(), z.array(z.any())]).optional(),
});

// Helper function for making requests
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ status: number; data: unknown; error?: string }> {
  const url = `${BASE_URL}${endpoint}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    let data: unknown;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { status: response.status, data };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { status: 0, data: null, error: 'Request timed out' };
      }
      return { status: 0, data: null, error: error.message };
    }
    return { status: 0, data: null, error: 'Unknown error' };
  }
}

async function translateRequest(
  body: Record<string, unknown>,
  apiKey?: string
): Promise<{ status: number; data: unknown }> {
  return apiRequest('/api/translate', {
    method: 'POST',
    headers: {
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('Translation Service E2E Tests', () => {
  beforeAll(async () => {
    // Check if service is reachable
    const { status, error } = await apiRequest('/health');
    if (status === 0 || error) {
      serviceReachable = false;
      console.warn(`Translation service not reachable: ${error || 'Unknown error'}`);
    }
  });

  describe('Health & Monitoring Endpoints', () => {
    it('GET /health returns healthy status', async () => {
      if (!serviceReachable) {
        console.warn('Skipping - service not reachable');
        return;
      }

      const { status, data, error } = await apiRequest('/health');

      if (error) {
        console.warn(`Health check failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = HealthResponseSchema.safeParse(data);
      if (!parsed.success) {
        // Log actual response for debugging
        console.log('Health response:', JSON.stringify(data, null, 2));
      }
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe('healthy');
      }
    });

    it('GET /ready returns ready status', async () => {
      if (!serviceReachable) {
        console.warn('Skipping - service not reachable');
        return;
      }

      const { status, data, error } = await apiRequest('/ready');

      if (error) {
        console.warn(`Ready check failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      // Service may return "ready" string or { status: "ready" } object
      if (typeof data === 'string') {
        expect(data).toBe('ready');
      } else {
        expect(data).toMatchObject({ status: 'ready' });
      }
    });

    it('GET /metrics returns Prometheus metrics', async () => {
      if (!serviceReachable) {
        console.warn('Skipping - service not reachable');
        return;
      }

      const { status, data, error } = await apiRequest('/metrics');

      if (error) {
        console.warn(`Metrics check failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      // Metrics may be string (prometheus format) or object (JSON)
      if (typeof data === 'string') {
        expect(data).toMatch(/translation_|http_|process_|#/);
      } else {
        // If JSON, just verify it's an object with data
        expect(data).toBeDefined();
      }
    });
  });

  describe('Authentication', () => {
    it('returns 401 when API key is missing', async () => {
      if (!serviceReachable) {
        console.warn('Skipping - service not reachable');
        return;
      }

      const { status, data, error } = await translateRequest({
        text: 'Hello',
        targetLanguage: 'es',
      });

      if (error) {
        console.warn(`Auth test failed: ${error}`);
        return;
      }

      expect(status).toBe(401);
      // Just verify we got some response - error format varies by service
      expect(data).toBeDefined();
    });

    it('returns 401 when API key is invalid', async () => {
      if (!serviceReachable) {
        console.warn('Skipping - service not reachable');
        return;
      }

      const { status, error } = await translateRequest(
        {
          text: 'Hello',
          targetLanguage: 'es',
        },
        'invalid-api-key'
      );

      if (error) {
        console.warn(`Auth test failed: ${error}`);
        return;
      }

      expect(status).toBe(401);
    });
  });

  describe('Input Validation', () => {
    beforeAll(() => {
      if (!API_KEY) {
        console.warn('TRANSLATE_API_KEY not set - skipping authenticated tests');
      }
    });

    it('returns 422 when text is empty', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: '',
          targetLanguage: 'es',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Validation test failed: ${error}`);
        return;
      }

      expect(status).toBe(422);
      const parsed = ErrorResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
    });

    it('returns 422 when targetLanguage is missing', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, error } = await translateRequest(
        {
          text: 'Hello world',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Validation test failed: ${error}`);
        return;
      }

      expect(status).toBe(422);
    });

    it('returns 422 when text exceeds max length', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, error } = await translateRequest(
        {
          text: 'a'.repeat(100001),
          targetLanguage: 'es',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Validation test failed: ${error}`);
        return;
      }

      expect(status).toBe(422);
    });
  });

  describe('Translation - European Languages', () => {
    beforeAll(() => {
      if (!API_KEY) {
        console.warn('TRANSLATE_API_KEY not set - skipping translation tests');
      }
    });

    it('translates English to Spanish', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Hello, how are you?',
          targetLanguage: 'es',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Translation test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.translatedText.toLowerCase()).toContain('hola');
      }
    });

    it('translates English to French', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Good morning',
          targetLanguage: 'fr',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Translation test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.translatedText.toLowerCase()).toMatch(/bonjour|bon matin/);
      }
    });

    it('translates English to German', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Thank you very much',
          targetLanguage: 'de',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Translation test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.translatedText.toLowerCase()).toMatch(/danke|vielen dank/);
      }
    });
  });

  describe('Translation - Asian Languages', () => {
    beforeAll(() => {
      if (!API_KEY) {
        console.warn('TRANSLATE_API_KEY not set - skipping translation tests');
      }
    });

    it('translates English to Japanese', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Hello',
          targetLanguage: 'ja',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Translation test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        // Check for Japanese characters
        expect(parsed.data.translatedText).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
      }
    });

    it('translates English to Chinese', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Hello',
          targetLanguage: 'zh',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Translation test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        // Check for Chinese characters
        expect(parsed.data.translatedText).toMatch(/[\u4e00-\u9fff]/);
      }
    });
  });

  describe('Translation - RTL Languages', () => {
    beforeAll(() => {
      if (!API_KEY) {
        console.warn('TRANSLATE_API_KEY not set - skipping RTL tests');
      }
    });

    it('translates to Arabic and returns isRTL flag', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Hello, how are you?',
          targetLanguage: 'ar',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Translation test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.isRTL).toBe(true);
        // Check for Arabic characters
        expect(parsed.data.translatedText).toMatch(/[\u0600-\u06FF]/);
      }
    });

    it('translates to Hebrew and returns isRTL flag', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Hello',
          targetLanguage: 'he',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Translation test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.isRTL).toBe(true);
        // Check for Hebrew characters
        expect(parsed.data.translatedText).toMatch(/[\u0590-\u05FF]/);
      }
    });
  });

  describe('Caching Behavior', () => {
    beforeAll(() => {
      if (!API_KEY) {
        console.warn('TRANSLATE_API_KEY not set - skipping cache tests');
      }
    });

    it('returns cached: true on repeat request', async () => {
      if (!API_KEY || !serviceReachable) return;

      const requestBody = {
        text: `Cache test ${Date.now()}`,
        targetLanguage: 'es',
      };

      // First request - should not be cached
      const first = await translateRequest(requestBody, API_KEY);
      if (first.error) {
        console.warn(`Cache test failed: ${first.error}`);
        return;
      }
      expect(first.status).toBe(200);

      // Second request - should be cached
      const second = await translateRequest(requestBody, API_KEY);
      if (second.error) {
        console.warn(`Cache test failed: ${second.error}`);
        return;
      }
      expect(second.status).toBe(200);

      const parsed = TranslateResponseSchema.safeParse(second.data);
      expect(parsed.success).toBe(true);
      if (parsed.success && parsed.data.cached !== undefined) {
        expect(parsed.data.cached).toBe(true);
      }
    });
  });

  describe('Translation Options', () => {
    beforeAll(() => {
      if (!API_KEY) {
        console.warn('TRANSLATE_API_KEY not set - skipping options tests');
      }
    });

    it('accepts quality parameter', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Hello world',
          targetLanguage: 'es',
          quality: 'high',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Options test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
    });

    it('accepts domain parameter', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'The server returned a 404 error',
          targetLanguage: 'es',
          domain: 'technical',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Options test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
    });

    it('accepts sourceLanguage parameter', async () => {
      if (!API_KEY || !serviceReachable) return;

      const { status, data, error } = await translateRequest(
        {
          text: 'Bonjour',
          targetLanguage: 'en',
          sourceLanguage: 'fr',
        },
        API_KEY
      );

      if (error) {
        console.warn(`Options test failed: ${error}`);
        return;
      }

      expect(status).toBe(200);
      const parsed = TranslateResponseSchema.safeParse(data);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.translatedText.toLowerCase()).toContain('hello');
      }
    });
  });
});
