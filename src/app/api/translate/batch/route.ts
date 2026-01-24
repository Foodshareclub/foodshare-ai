import { NextRequest, NextResponse } from 'next/server';
import { apiHandler } from '@/lib/api-handler';
import { apiKeyMiddleware } from '@/lib/api-key';
import { translationService } from '@/lib/translation';
import { LLMTranslationProvider } from '@/lib/translation/llm-provider';

// Register LLM provider
translationService.registerProvider('llm', new LLMTranslationProvider());

export const POST = apiHandler(async (req: NextRequest) => {
  // Check API key
  const authError = apiKeyMiddleware(req);
  if (authError) return authError;

  const body = await req.json();
  const { requests } = body;
  
  const results = await translationService.batchTranslate(requests);
  return NextResponse.json({ 
    results,
    summary: {
      total: results.length,
      successful: results.length,
      failed: 0
    }
  });
});
