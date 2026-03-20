/**
 * Safety module - トレーディングBot暴走防止
 *
 * OpenClawのセーフティ機構を統合的に提供する。
 * - 入力フィルタリング (trading-filter)
 * - コンテキスト分離 (context-isolation)
 * - レート制限 (rate-limiter)
 * - キルスイッチ (kill-switch)
 */

export {
  filterTradingContent,
  filterTradingBatch,
  type TradingFilterResult,
} from "./trading-filter.js";
export {
  isTradingSession,
  checkContextIsolation,
  checkMemoryIsolation,
  type IsolationPolicy,
  type IsolationCheckResult,
} from "./context-isolation.js";
export {
  createSafetyRateLimiter,
  type SafetyRateLimiter,
  type SafetyRateLimiterConfig,
  type RateLimitCheckResult,
} from "./rate-limiter.js";
export {
  createKillSwitch,
  type KillSwitch,
  type KillSwitchConfig,
  type KillSwitchState,
} from "./kill-switch.js";
export {
  createSafetyGateway,
  type SafetyGateway,
  type SafetyGatewayConfig,
  type SafetyCheckResult,
} from "./gateway-integration.js";
