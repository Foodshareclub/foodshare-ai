import { TranslationProvider, TranslationRequest, TranslationResult } from './index';
import { chat } from '@/lib/llm';

export class LLMTranslationProvider implements TranslationProvider {
  private readonly supportedLanguages = [
    // Global
    'en', 'es', 'fr', 'pt',
    // European
    'cs', 'de', 'ru', 'uk', 'it', 'pl', 'nl', 'sv',
    // Asian
    'zh', 'hi', 'ja', 'ko', 'vi', 'id', 'th',
    // MENA
    'ar', 'tr'
  ];

  private readonly rtlLanguages = ['ar'];

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const sourceLanguage = request.sourceLanguage || await this.detectLanguage(request.text);
    
    const systemPrompt = this.buildSystemPrompt(request, sourceLanguage);
    const userPrompt = this.buildUserPrompt(request);

    const startTime = Date.now();
    const response = await chat(userPrompt, {
      systemPrompt,
      temperature: 0.1,
      maxTokens: 2048,
      useReviewModel: request.quality === 'high',
    });

    const parsed = this.parseResponse(response);
    
    return {
      translatedText: parsed.translation,
      sourceLanguage,
      confidence: parsed.confidence,
      alternatives: parsed.alternatives,
      metadata: {
        model: request.quality === 'high' ? 'review-model' : 'standard-model',
        provider: 'llm',
        duration: Date.now() - startTime,
        cached: false,
        isRTL: this.rtlLanguages.includes(request.targetLanguage),
      },
    };
  }

  async detectLanguage(text: string): Promise<string> {
    const prompt = `Detect the language of this text and respond with only the ISO 639-1 code: "${text.slice(0, 200)}"`;
    const response = await chat(prompt, { temperature: 0, maxTokens: 10 });
    return response.trim().toLowerCase();
  }

  getSupportedLanguages(): string[] {
    return [...this.supportedLanguages];
  }

  private buildSystemPrompt(request: TranslationRequest, sourceLanguage: string): string {
    const qualityInstructions = {
      fast: 'Provide a quick, accurate translation.',
      balanced: 'Provide an accurate translation with good fluency.',
      high: 'Provide a high-quality translation with perfect fluency and cultural adaptation.',
    };

    const domainInstructions = {
      technical: 'Use technical terminology and maintain precision.',
      business: 'Use professional business language and formal tone.',
      legal: 'Use precise legal terminology and formal structure.',
      general: 'Use natural, everyday language.',
    };

    const isRTL = this.rtlLanguages.includes(request.targetLanguage);
    const rtlNote = isRTL ? '\n- Ensure proper RTL text direction and formatting' : '';

    return `You are an expert translator specializing in ${request.domain} content.

TASK: Translate from ${sourceLanguage} to ${request.targetLanguage}
QUALITY: ${qualityInstructions[request.quality]}
DOMAIN: ${domainInstructions[request.domain]}
${request.context ? `CONTEXT: ${request.context}` : ''}

RESPONSE FORMAT (JSON):
{
  "translation": "translated text",
  "confidence": 0.95,
  "alternatives": ["alt1", "alt2"]
}

RULES:
- Maintain original meaning and tone
- Adapt cultural references appropriately
- Preserve formatting and structure
- Use domain-appropriate terminology
- Provide confidence score (0-1)
- Include 2-3 alternatives for key phrases if quality is "high"${rtlNote}`;
  }

  private buildUserPrompt(request: TranslationRequest): string {
    return `Translate this text:\n\n${request.text}`;
  }

  private parseResponse(response: string): { translation: string; confidence: number; alternatives?: string[] } {
    try {
      const parsed = JSON.parse(response);
      return {
        translation: parsed.translation || response,
        confidence: parsed.confidence || 0.8,
        alternatives: parsed.alternatives,
      };
    } catch {
      // Fallback if JSON parsing fails
      return {
        translation: response.trim(),
        confidence: 0.7,
      };
    }
  }
}
