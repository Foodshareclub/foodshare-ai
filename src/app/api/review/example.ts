import { NextResponse } from 'next/server';
import { apiHandler } from '@/lib/api-handler';
import { reviewRequestSchema } from '@/lib/validation';

export const POST = apiHandler(
  async (req) => {
    const body = await req.json();
    const validated = reviewRequestSchema.parse(body);
    
    // Your review logic here
    
    return NextResponse.json({ success: true, data: validated });
  },
  {
    rateLimit: { windowMs: 60000, maxRequests: 10 },
    validateBody: reviewRequestSchema,
  }
);
