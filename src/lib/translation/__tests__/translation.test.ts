import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translationService } from '../index';
import { LLMTranslationProvider } from '../llm-provider';

// Mock dependencies
vi.mock('@/lib/logger');
vi.mock('@/lib/llm');

describe('Translation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should translate text successfully', async () => {
    const provider = new LLMTranslationProvider();
    translationService.registerProvider('test', provider);

    const request = {
      text: 'Hello world',
      targetLanguage: 'es',
      quality: 'balanced' as const,
      domain: 'general' as const,
    };

    vi.mocked(provider.translate).mockResolvedValue({
      translatedText: 'Hola mundo',
      sourceLanguage: 'en',
      confidence: 0.95,
      metadata: {
        model: 'test-model',
        provider: 'test',
        duration: 100,
        cached: false,
      },
    });

    const result = await translationService.translate(request);
    
    expect(result.translatedText).toBe('Hola mundo');
    expect(result.confidence).toBe(0.95);
  });

  it('should handle batch translations', async () => {
    const requests = [
      { text: 'Hello', targetLanguage: 'es', quality: 'fast' as const, domain: 'general' as const },
      { text: 'World', targetLanguage: 'fr', quality: 'fast' as const, domain: 'general' as const },
    ];

    const results = await translationService.batchTranslate(requests);
    expect(results).toHaveLength(2);
  });

  it('should validate input parameters', async () => {
    const invalidRequest = {
      text: '', // Invalid: empty text
      targetLanguage: 'es',
    };

    await expect(translationService.translate(invalidRequest as any))
      .rejects.toThrow();
  });
});
