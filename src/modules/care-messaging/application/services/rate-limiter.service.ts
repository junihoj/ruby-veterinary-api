import { Injectable } from '@nestjs/common';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * In-memory token bucket (messaging-protocol.md §Rate Limits). Reset on
 * process restart; the DB-backed daily cap is the durable limit.
 */
@Injectable()
export class ChatRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  allow(key: string, perMinute: number): boolean {
    if (perMinute <= 0) return true;
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? {
      tokens: perMinute,
      updatedAt: now,
    };

    const elapsed = now - bucket.updatedAt;
    bucket.tokens = Math.min(
      perMinute,
      bucket.tokens + (elapsed * perMinute) / 60_000,
    );
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);

    if (this.buckets.size > 10_000) this.prune(now);
    return true;
  }

  reset(): void {
    this.buckets.clear();
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > 10 * 60_000) this.buckets.delete(key);
    }
  }
}
