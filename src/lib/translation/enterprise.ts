import { translationService, TranslationRequest } from '@/lib/translation';
import { LLMTranslationProvider } from '@/lib/translation/llm-provider';

// Enterprise translation provider for self-hosted LLMs
class EnterpriseTranslationProvider extends LLMTranslationProvider {
  async translate(request: TranslationRequest) {
    // Use enterprise model with enhanced prompts
    const result = await super.translate({
      ...request,
      quality: 'high', // Always use high quality for enterprise
    });

    // Add enterprise-specific metadata
    result.metadata = {
      ...result.metadata,
      provider: 'enterprise-llm',
      compliance: 'gdpr-compliant',
      dataResidency: 'on-premise',
    };

    return result;
  }
}

// Register enterprise provider if enterprise mode is enabled
if (process.env.ENTERPRISE_MODE === 'true') {
  translationService.registerProvider('enterprise', new EnterpriseTranslationProvider());
}

export { translationService };
