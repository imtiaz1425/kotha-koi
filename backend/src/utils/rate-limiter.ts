export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * In-memory sliding-window rate limiter per TRD §9.
 * Suitable for single-instance pilot deployments.
 */
export class RateLimiter {
  private readonly hits: Map<string, number[]> = new Map()

  /**
   * Check and consume a token for the given key.
   *
   * @param key - The unique identifier (e.g. IP address or email)
   * @param max - Maximum allowed requests within windowMs
   * @param windowMs - Time window in milliseconds
   */
  consume(key: string, max: number, windowMs: number): RateLimitResult {
    const now = Date.now()
    const timestamps = this.hits.get(key) || []

    // Filter out timestamps outside the active window
    const validTimestamps = timestamps.filter((t) => now - t < windowMs)

    if (validTimestamps.length >= max) {
      // Calculate retry-after based on the oldest timestamp in the current window
      const oldestHit = validTimestamps[0]
      const timeRemainingMs = windowMs - (now - oldestHit)
      const retryAfterSeconds = Math.max(1, Math.ceil(timeRemainingMs / 1000))

      this.hits.set(key, validTimestamps)
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      }
    }

    validTimestamps.push(now)
    this.hits.set(key, validTimestamps)

    return {
      allowed: true,
      remaining: max - validTimestamps.length,
      retryAfterSeconds: 0,
    }
  }

  /**
   * Clear all tracked rate limit buckets. Used primarily for unit tests.
   */
  reset(): void {
    this.hits.clear()
  }
}

export const authRateLimiter = new RateLimiter()
export const iceServersRateLimiter = new RateLimiter()
