type BucketState = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, BucketState>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const state = buckets.get(key);

  if (!state || state.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  if (state.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: state.resetAt,
    };
  }

  state.count += 1;
  buckets.set(key, state);

  return {
    allowed: true,
    remaining: Math.max(limit - state.count, 0),
    resetAt: state.resetAt,
  };
}

export function createRequestId() {
  return crypto.randomUUID();
}
