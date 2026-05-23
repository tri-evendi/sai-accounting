/**
 * In-memory rate limiter for auth-sensitive endpoints.
 * For multi-instance production, replace with Redis-backed limiting.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

export type RateLimitOptions = {
  windowMs?: number;
  maxAttempts?: number;
};

const DEFAULT_OPTIONS: Required<RateLimitOptions> = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
};

export const RATE_LIMITS = {
  login: { windowMs: 15 * 60 * 1000, maxAttempts: 10 },
  changePassword: { windowMs: 15 * 60 * 1000, maxAttempts: 5 },
} as const;

export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const { windowMs, maxAttempts } = { ...DEFAULT_OPTIONS, ...options };
  const now = Date.now();
  const record = attempts.get(key);

  if (record && record.resetAt < now) {
    attempts.delete(key);
  }

  const current = attempts.get(key);

  if (!current) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  if (current.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: current.resetAt - now,
    };
  }

  current.count += 1;
  return { allowed: true, remaining: maxAttempts - current.count };
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of attempts) {
      if (record.resetAt < now) {
        attempts.delete(key);
      }
    }
  }, 60_000);
}
