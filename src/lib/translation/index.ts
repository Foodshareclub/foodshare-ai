import { z } from 'zod';
import { logger } from '@/lib/logger';
import { withRetry } from '@/lib/retry';
import { llmCircuitBreaker } from '@/lib/circuit-breaker';
import { cache } from '@/lib/cache-manager';

export const TranslationSchema = z.object({
  text: z.string().min(1).max(10000),
  targetLanguage: z.string().min(2).max(10),
  sourceLanguage: z.string().optional(),
  context: z.string().optional(),
  domain: z.enum(['technical', 'business', 'general', 'legal']).default('general'),
  quality: z.enum(['fast', 'balanced', 'high']).default('balanced'),
});

export type TranslationRequest = z.infer<typeof TranslationSchema>;

export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  confidence: number;
  alternatives?: string[];
  metadata: {
    model: string;
    provider: string;
    duration: number;
    cached: boolean;
    isRTL?: boolean;
    compliance?: string;
    dataResidency?: string;
  };
}

export interface TranslationProvider {
  translate(request: TranslationRequest): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<string>;
  getSupportedLanguages(): string[];
}

class TranslationService {
  private providers = new Map<string, TranslationProvider>();

  registerProvider(name: string, provider: TranslationProvider) {
    this.providers.set(name, provider);
    logger.info('Translation provider registered', { provider: name });
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const validated = TranslationSchema.parse(request);
    const cacheKey = this.getCacheKey(validated);
    
    // Check cache first
    const cached = cache.get<TranslationResult>(cacheKey);
    if (cached) {
      return { ...cached, metadata: { ...cached.metadata, cached: true } };
    }

    const startTime = Date.now();
    
    try {
      const result = await withRetry(
        () => this.performTranslation(validated),
        { maxAttempts: 3, baseDelay: 1000 }
      );

      result.metadata.duration = Date.now() - startTime;
      result.metadata.cached = false;

      // Cache successful translations
      cache.set(cacheKey, result, 3600000); // 1 hour TTL in ms
      
      logger.info('Translation completed', {
        sourceLanguage: result.sourceLanguage,
        targetLanguage: validated.targetLanguage,
        textLength: validated.text.length,
        duration: result.metadata.duration,
        provider: result.metadata.provider,
      });

      return result;
    } catch (error) {
      logger.error('Translation failed', error as Error, {
        targetLanguage: validated.targetLanguage,
        textLength: validated.text.length,
      });
      throw error;
    }
  }

  private async performTranslation(request: TranslationRequest): Promise<TranslationResult> {
    const provider = this.selectProvider(request);
    if (!provider) {
      throw new Error('No translation provider available');
    }

    return llmCircuitBreaker.execute(() => provider.translate(request));
  }

  private selectProvider(_request: TranslationRequest): TranslationProvider | null {
    // Priority: enterprise > groq > ollama > llm
    return this.providers.get('enterprise') || 
           this.providers.get('groq') || 
           this.providers.get('ollama') || 
           this.providers.get('llm') ||
           null;
  }

  private getCacheKey(request: TranslationRequest): string {
    return `translation:${Buffer.from(JSON.stringify(request)).toString('base64')}`;
  }

  async batchTranslate(requests: TranslationRequest[]): Promise<TranslationResult[]> {
    const results = await Promise.allSettled(
      requests.map(req => this.translate(req))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      logger.error('Batch translation item failed', result.reason, { index });
      throw result.reason;
    });
  }

  getStatus() {
    return {
      providers: Array.from(this.providers.keys()),
      circuitBreakerState: llmCircuitBreaker.getState(),
    };
  }
}

export const translationService = new TranslationService();
