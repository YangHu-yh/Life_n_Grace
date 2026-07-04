import type { NextRequest } from "next/server";

// Fixed-window in-memory rate limiter. State is per server instance: on the
// Lambda demo tier that means per warm container, and on multi-task ECS each
// task counts separately — acceptable brute-force protection at demo scale.
// Replace with a shared store (Redis/DynamoDB) before scaling out.

type WindowEntry = { count: number; resetAt: number };

const windows = new Map<string, WindowEntry>();

const MAX_TRACKED_KEYS = 10_000;

function prune(now: number) {
  if (windows.size < MAX_TRACKED_KEYS) return;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

export function getClientIp(request: NextRequest): string {
  // NextRequest.ip was removed in Next 15; ALB/Lambda Function URL and most
  // proxies set x-forwarded-for.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  prune(now);

  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    };
  }
  return { allowed: true };
}
