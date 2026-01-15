import { describe, it, expect } from 'vitest';
import { withRetry, withTimeout } from '../retry';

describe('Retry Logic', () => {
  it('should succeed on first attempt', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      return 'success';
    });
    
    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      },
      { maxAttempts: 3, baseDelay: 10 }
    );
    
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after max attempts', async () => {
    await expect(
      withRetry(
        async () => {
          throw new Error('always fails');
        },
        { maxAttempts: 2, baseDelay: 10 }
      )
    ).rejects.toThrow('always fails');
  });
});

describe('Timeout', () => {
  it('should complete before timeout', async () => {
    const result = await withTimeout(
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      },
      100
    );
    
    expect(result).toBe('done');
  });

  it('should timeout on slow operation', async () => {
    await expect(
      withTimeout(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'done';
        },
        50
      )
    ).rejects.toThrow('Operation timed out');
  });
});
