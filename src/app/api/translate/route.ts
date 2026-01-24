import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiHandler } from '@/lib/api-handler';
import { apiKeyMiddleware } from '@/lib/api-key';
import { translationService } from '@/lib/translation';
import { LLMTranslationProvider } from '@/lib/translation/llm-provider';

// Register LLM provider
translationService.registerProvider('llm', new LLMTranslationProvider());

const TranslateRequestSchema = z.object({
  text: z.string().min(1).max(10000),
  targetLanguage: z.string().min(2).max(10),
  sourceLanguage: z.string().optional(),
  context: z.string().optional(),
  domain: z.enum(['technical', 'business', 'general', 'legal']).default('general'),
  quality: z.enum(['fast', 'balanced', 'high']).default('balanced'),
});

const BatchTranslateRequestSchema = z.object({
  requests: z.array(TranslateRequestSchema).min(1).max(50),
});

async function handleTranslate(req: NextRequest) {
  const body = await req.json();
  const request = TranslateRequestSchema.parse(body);
  
  const result = await translationService.translate(request);
  return NextResponse.json(result);
}

async function handleBatchTranslate(req: NextRequest) {
  const body = await req.json();
  const { requests } = BatchTranslateRequestSchema.parse(body);
  
  const results = await translationService.batchTranslate(requests);
  return NextResponse.json({ results });
}

async function handleStatus() {
  const status = translationService.getStatus();
  return NextResponse.json(status);
}

export const POST = apiHandler(async (req: NextRequest) => {
  // Check API key
  const authError = apiKeyMiddleware(req);
  if (authError) return authError;

  const url = new URL(req.url);
  
  if (url.pathname.endsWith('/batch')) {
    return handleBatchTranslate(req);
  }
  
  return handleTranslate(req);
});

export const GET = apiHandler(handleStatus);
