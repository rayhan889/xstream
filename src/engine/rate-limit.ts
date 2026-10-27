const RESERVE_REQUESTS = 2;
const RESET_SLACK_MS = 1_000;
const HEADERLESS_429_BASE_MS = 60_000;
const HEADERLESS_429_MAX_MS = 5 * 60_000;

export interface RateLimitSnapshot {
  limit: number;
  remaining: number;
  resetAt: number;
}

export class RateLimitTracker {
  private snapshot: RateLimitSnapshot | null = null;
  private blockedUntil = 0;
  private headerless429Ms = HEADERLESS_429_BASE_MS;

  public update(headers: Record<string, string>, status: number): void {
    const limit = Number(headers["x-rate-limit-limit"]);
    const remaining = Number(headers["x-rate-limit-remaining"]);
    const reset = Number(headers["x-rate-limit-reset"]);
    const hasHeaders =
      Number.isFinite(limit) &&
      Number.isFinite(remaining) &&
      Number.isFinite(reset);

    if (hasHeaders) {
      this.snapshot = { limit, remaining, resetAt: reset * 1000 };
    }

    if (status === 429) {
      if (hasHeaders) {
        this.blockedUntil = reset * 1000;
      } else {
        this.blockedUntil = Date.now() + this.headerless429Ms;
        this.headerless429Ms = Math.min(
          this.headerless429Ms * 2,
          HEADERLESS_429_MAX_MS,
        );
      }
    } else if (status === 200) {
      this.headerless429Ms = HEADERLESS_429_BASE_MS;
    }
  }

  public getSnapshot(): RateLimitSnapshot | null {
    return this.snapshot;
  }

  public nextDelay(minMs: number, now: number = Date.now()): number {
    if (this.blockedUntil > now) {
      return this.blockedUntil - now + RESET_SLACK_MS;
    }

    const snapshot = this.snapshot;
    if (!snapshot || snapshot.resetAt <= now) return minMs;

    const usable = snapshot.remaining - RESERVE_REQUESTS;
    if (usable <= 0) return snapshot.resetAt - now + RESET_SLACK_MS;

    return Math.max(minMs, Math.ceil((snapshot.resetAt - now) / usable));
  }
}
