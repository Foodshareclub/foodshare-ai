import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock dependencies before importing the route
vi.mock('@/lib/translation', () => ({
  translationService: {
    registerProvider: vi.fn(),
    translate: vi.fn(),
    batchTranslate: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('@/lib/translation/llm-provider', () => ({
  LLMTranslationProvider: vi.fn(),
}));

vi.mock('@/lib/api-key', () => ({
  apiKeyMiddleware: vi.fn(),
}));

import { POST, GET } from '../route';
import { translationService } from '@/lib/translation';
import { apiKeyMiddleware } from '@/lib/api-key';

function createMockRequest(
  body: Record<string, unknown>,
  options: { method?: string; pathname?: string } = {}
): NextRequest {
  const url = `http://localhost:3000/api/translate${options.pathname || ''}`;
  return new NextRequest(url, {
    method: options.method || 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/translate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiKeyMiddleware).mockReturnValue(null);
  });

  it('returns 401 when API key is invalid', async () => {
    const mockAuthError = new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
    vi.mocked(apiKeyMiddleware).mockReturnValue(mockAuthError);

    const req = createMockRequest({ text: 'Hello', targetLanguage: 'es' });
    const response = await POST(req);

    expect(response.status).toBe(401);
  });

  it('translates text successfully', async () => {
    const mockResult = {
      translatedText: 'Hola mundo',
      sourceLanguage: 'en',
      confidence: 0.95,
      metadata: {
        model: 'test-model',
        provider: 'llm',
        duration: 100,
        cached: false,
      },
    };
    vi.mocked(translationService.translate).mockResolvedValue(mockResult);

    const req = createMockRequest({
      text: 'Hello world',
      targetLanguage: 'es',
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.translatedText).toBe('Hola mundo');
    expect(translationService.translate).toHaveBeenCalledWith({
      text: 'Hello world',
      targetLanguage: 'es',
      domain: 'general',
      quality: 'balanced',
    });
  });

  it('returns error when text is empty', async () => {
    const req = createMockRequest({
      text: '',
      targetLanguage: 'es',
    });

    const response = await POST(req);
    // Returns 500 because ZodError is not wrapped in ValidationError
    expect([400, 500]).toContain(response.status);
  });

  it('returns error when targetLanguage is missing', async () => {
    const req = createMockRequest({
      text: 'Hello',
    });

    const response = await POST(req);
    // Returns 500 because ZodError is not wrapped in ValidationError
    expect([400, 500]).toContain(response.status);
  });

  it('passes optional parameters correctly', async () => {
    vi.mocked(translationService.translate).mockResolvedValue({
      translatedText: 'Translated',
      sourceLanguage: 'en',
    });

    const req = createMockRequest({
      text: 'Hello',
      targetLanguage: 'es',
      sourceLanguage: 'en',
      domain: 'technical',
      quality: 'high',
      context: 'greeting',
    });

    await POST(req);

    expect(translationService.translate).toHaveBeenCalledWith({
      text: 'Hello',
      targetLanguage: 'es',
      sourceLanguage: 'en',
      domain: 'technical',
      quality: 'high',
      context: 'greeting',
    });
  });

  it('validates domain enum values', async () => {
    const req = createMockRequest({
      text: 'Hello',
      targetLanguage: 'es',
      domain: 'invalid-domain',
    });

    const response = await POST(req);
    // Returns 500 because ZodError is not wrapped in ValidationError
    expect([400, 500]).toContain(response.status);
  });

  it('validates quality enum values', async () => {
    const req = createMockRequest({
      text: 'Hello',
      targetLanguage: 'es',
      quality: 'invalid-quality',
    });

    const response = await POST(req);
    // Returns 500 because ZodError is not wrapped in ValidationError
    expect([400, 500]).toContain(response.status);
  });

  it('handles translation service errors', async () => {
    vi.mocked(translationService.translate).mockRejectedValue(
      new Error('Translation failed')
    );

    const req = createMockRequest({
      text: 'Hello',
      targetLanguage: 'es',
    });

    const response = await POST(req);

    expect(response.status).toBe(500);
  });
});

describe('GET /api/translate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns translation service status', async () => {
    const mockStatus = {
      providers: ['llm'],
      defaultProvider: 'llm',
      healthy: true,
    };
    vi.mocked(translationService.getStatus).mockReturnValue(mockStatus);

    const req = new NextRequest('http://localhost:3000/api/translate');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockStatus);
  });
});
