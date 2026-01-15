import { describe, it, expect, beforeEach } from 'vitest';
import { cache, cached } from '../cache-manager';

describe('Cache Manager', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('should cache and retrieve values', () => {
    cache.set('key1', 'value1', 1000);
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return null for missing keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should expire entries', async () => {
    cache.set('key2', 'value2', 50);
    expect(cache.get('key2')).toBe('value2');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cache.get('key2')).toBeNull();
  });

  it('should cache function results', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return 'result';
    };

    const result1 = await cached('fn-key', fn, 1000);
    const result2 = await cached('fn-key', fn, 1000);

    expect(result1).toBe('result');
    expect(result2).toBe('result');
    expect(calls).toBe(1);
  });

  it('should delete entries', () => {
    cache.set('key3', 'value3', 1000);
    cache.delete('key3');
    expect(cache.get('key3')).toBeNull();
  });
});
