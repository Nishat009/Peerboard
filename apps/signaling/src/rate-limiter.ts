/**
 * Token bucket: allows short bursts (ICE trickle sends many candidates at once)
 * while capping sustained throughput.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  tryRemove(count = 1): boolean {
    this.refill();
    if (this.tokens < count) return false;
    this.tokens -= count;
    return true;
  }

  private refill(): void {
    const now = this.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.lastRefill = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
  }
}

/** One bucket per key (e.g. client IP), with idle-bucket eviction to bound memory. */
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, { bucket: TokenBucket; lastSeen: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
    private readonly idleMs = 10 * 60_000,
  ) {}

  tryRemove(key: string, count = 1): boolean {
    const now = this.now();
    let entry = this.buckets.get(key);
    if (!entry) {
      entry = {
        bucket: new TokenBucket(this.capacity, this.refillPerSecond, this.now),
        lastSeen: now,
      };
      this.buckets.set(key, entry);
    }
    entry.lastSeen = now;
    return entry.bucket.tryRemove(count);
  }

  sweep(): void {
    const cutoff = this.now() - this.idleMs;
    for (const [key, entry] of this.buckets) {
      if (entry.lastSeen < cutoff) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}
