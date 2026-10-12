import { describe, expect, it } from 'vitest';
import { KeyedRateLimiter, TokenBucket } from '../src/rate-limiter';

describe('TokenBucket', () => {
  it('allows bursts up to capacity, then refills over time', () => {
    let now = 0;
    const bucket = new TokenBucket(3, 1, () => now);
    expect([bucket.tryRemove(), bucket.tryRemove(), bucket.tryRemove()]).toEqual([
      true,
      true,
      true,
    ]);
    expect(bucket.tryRemove()).toBe(false);
    now += 1000;
    expect(bucket.tryRemove()).toBe(true);
    expect(bucket.tryRemove()).toBe(false);
  });

  it('never exceeds capacity after a long idle period', () => {
    let now = 0;
    const bucket = new TokenBucket(2, 10, () => now);
    now += 60_000;
    expect([bucket.tryRemove(), bucket.tryRemove(), bucket.tryRemove()]).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe('KeyedRateLimiter', () => {
  it('limits keys independently and evicts idle buckets', () => {
    let now = 0;
    const limiter = new KeyedRateLimiter(1, 0, () => now, 1000);
    expect(limiter.tryRemove('a')).toBe(true);
    expect(limiter.tryRemove('a')).toBe(false);
    expect(limiter.tryRemove('b')).toBe(true);
    now += 2000;
    limiter.sweep();
    expect(limiter.size).toBe(0);
  });
});
