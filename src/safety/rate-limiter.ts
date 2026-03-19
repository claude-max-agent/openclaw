/**
 * 外部API呼び出しレート制限
 *
 * OpenClawからの外部API呼び出しに上限を設定し、暴走時の被害を最小限にする。
 */

import { createFixedWindowRateLimiter } from "../infra/fixed-window-rate-limit.js";

export type SafetyRateLimiterConfig = {
  /** 1分あたりの最大外部API呼び出し回数 */
  maxRequestsPerMinute: number;
  /** 1時間あたりの最大外部API呼び出し回数 */
  maxRequestsPerHour: number;
  /** 1分あたりの最大トークン消費量 */
  maxTokensPerMinute: number;
};

const DEFAULT_CONFIG: SafetyRateLimiterConfig = {
  maxRequestsPerMinute: 30,
  maxRequestsPerHour: 500,
  maxTokensPerMinute: 100_000,
};

export type RateLimitCheckResult = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
  limitType?: "per-minute" | "per-hour" | "tokens";
};

export type SafetyRateLimiter = {
  /** API呼び出し前にチェック。allowed=falseならブロック */
  checkRequest: () => RateLimitCheckResult;
  /** トークン消費をチェック */
  checkTokens: (tokenCount: number) => RateLimitCheckResult;
  /** カウンターをリセット */
  reset: () => void;
  /** 現在の使用状況を取得 */
  getUsage: () => {
    requestsThisMinute: number;
    requestsThisHour: number;
    tokensThisMinute: number;
  };
};

/**
 * 外部API呼び出し用のレートリミッターを作成する
 */
export function createSafetyRateLimiter(
  config: Partial<SafetyRateLimiterConfig> = {},
): SafetyRateLimiter {
  const cfg: SafetyRateLimiterConfig = { ...DEFAULT_CONFIG, ...config };

  const perMinute = createFixedWindowRateLimiter({
    maxRequests: cfg.maxRequestsPerMinute,
    windowMs: 60_000,
  });

  const perHour = createFixedWindowRateLimiter({
    maxRequests: cfg.maxRequestsPerHour,
    windowMs: 3_600_000,
  });

  let tokensThisMinute = 0;
  let tokenWindowStart = Date.now();

  return {
    checkRequest(): RateLimitCheckResult {
      const minuteResult = perMinute.consume();
      if (!minuteResult.allowed) {
        return {
          allowed: false,
          retryAfterMs: minuteResult.retryAfterMs,
          remaining: minuteResult.remaining,
          limitType: "per-minute",
        };
      }

      const hourResult = perHour.consume();
      if (!hourResult.allowed) {
        return {
          allowed: false,
          retryAfterMs: hourResult.retryAfterMs,
          remaining: hourResult.remaining,
          limitType: "per-hour",
        };
      }

      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: Math.min(minuteResult.remaining, hourResult.remaining),
      };
    },

    checkTokens(tokenCount: number): RateLimitCheckResult {
      const now = Date.now();
      if (now - tokenWindowStart >= 60_000) {
        tokensThisMinute = 0;
        tokenWindowStart = now;
      }

      if (tokensThisMinute + tokenCount > cfg.maxTokensPerMinute) {
        return {
          allowed: false,
          retryAfterMs: Math.max(0, tokenWindowStart + 60_000 - now),
          remaining: Math.max(0, cfg.maxTokensPerMinute - tokensThisMinute),
          limitType: "tokens",
        };
      }

      tokensThisMinute += tokenCount;
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: cfg.maxTokensPerMinute - tokensThisMinute,
      };
    },

    reset() {
      perMinute.reset();
      perHour.reset();
      tokensThisMinute = 0;
      tokenWindowStart = Date.now();
    },

    getUsage() {
      return {
        requestsThisMinute: cfg.maxRequestsPerMinute - (perMinute.consume().remaining + 1),
        requestsThisHour: cfg.maxRequestsPerHour - (perHour.consume().remaining + 1),
        tokensThisMinute,
      };
    },
  };
}
