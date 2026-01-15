import { describe, it, expect } from 'vitest';
import { rateLimit } from '../rate-limit';

describe('Rate Limiting', () => {
  it('should allow requests within limit', () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 5 });
    
    const result1 = limiter('test-ip');
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(4);
    
    const result2 = limiter('test-ip');
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(3);
  });

  it('should block requests exceeding limit', () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 2 });
    
    limiter('test-ip-2');
    limiter('test-ip-2');
    const result = limiter('test-ip-2');
    
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset after window expires', async () => {
    const limiter = rateLimit({ windowMs: 100, maxRequests: 1 });
    
    limiter('test-ip-3');
    const blocked = limiter('test-ip-3');
    expect(blocked.allowed).toBe(false);
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const allowed = limiter('test-ip-3');
    expect(allowed.allowed).toBe(true);
  });
});
