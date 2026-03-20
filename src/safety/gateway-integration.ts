/**
 * Safety Gateway Integration - セーフティモジュールのゲートウェイ統合レイヤー
 *
 * 各safetyモジュール（trading-filter, context-isolation, rate-limiter, kill-switch）を
 * ゲートウェイのリクエスト処理パイプラインに統合する。
 */

import { checkContextIsolation, type IsolationPolicy } from "./context-isolation.js";
import { createKillSwitch, type KillSwitch, type KillSwitchConfig } from "./kill-switch.js";
import {
  createSafetyRateLimiter,
  type SafetyRateLimiter,
  type SafetyRateLimiterConfig,
} from "./rate-limiter.js";
import { filterTradingContent } from "./trading-filter.js";

export type SafetyGatewayConfig = {
  /** セーフティ機構全体の有効化フラグ */
  enabled: boolean;
  /** トレーディングフィルタの閾値（デフォルト: 30） */
  tradingFilterThreshold: number;
  /** コンテキスト分離ポリシー */
  isolationPolicy: IsolationPolicy;
  /** キルスイッチ設定 */
  killSwitch: Partial<KillSwitchConfig>;
  /** レートリミッター設定 */
  rateLimiter: Partial<SafetyRateLimiterConfig>;
};

const DEFAULT_CONFIG: SafetyGatewayConfig = {
  enabled: true,
  tradingFilterThreshold: 30,
  isolationPolicy: "strict",
  killSwitch: {},
  rateLimiter: {},
};

export type SafetyCheckResult = {
  allowed: boolean;
  reason?: string;
  module?: "trading-filter" | "context-isolation" | "rate-limiter" | "kill-switch";
};

export type SafetyGateway = {
  /** 受信メッセージのセーフティチェック（WebSocketメッセージ用） */
  checkIncomingMessage: (text: string) => SafetyCheckResult;
  /** ゲートウェイリクエストのセーフティチェック */
  checkRequest: () => SafetyCheckResult;
  /** セッション間コンテキスト共有のチェック */
  checkSessionIsolation: (sourceSession: string, targetSession: string) => SafetyCheckResult;
  /** エラーを記録 */
  recordError: (error: string) => void;
  /** キルスイッチの状態を取得 */
  getKillSwitchState: () => ReturnType<KillSwitch["getState"]>;
  /** レートリミッターの使用状況を取得 */
  getRateLimiterUsage: () => ReturnType<SafetyRateLimiter["getUsage"]>;
  /** キルスイッチを手動リセット */
  resetKillSwitch: () => void;
  /** 有効化状態 */
  isEnabled: () => boolean;
};

/**
 * セーフティゲートウェイを作成する
 *
 * ゲートウェイ起動時に1回呼び出し、返されたオブジェクトをリクエスト処理パイプラインで使用する。
 */
export function createSafetyGateway(
  config: Partial<SafetyGatewayConfig> = {},
  logger?: { warn: (msg: string) => void; error: (msg: string) => void },
): SafetyGateway {
  const cfg: SafetyGatewayConfig = { ...DEFAULT_CONFIG, ...config };

  const killSwitch = createKillSwitch(cfg.killSwitch);
  const rateLimiter = createSafetyRateLimiter(cfg.rateLimiter);

  // キルスイッチ発動時のログ出力
  killSwitch.onTriggered((reason) => {
    logger?.error(`[safety] kill-switch triggered: ${reason}`);
  });

  return {
    checkIncomingMessage(text: string): SafetyCheckResult {
      if (!cfg.enabled) {
        return { allowed: true };
      }

      // キルスイッチが発動済みなら全ブロック
      if (!killSwitch.isOperationAllowed()) {
        return {
          allowed: false,
          reason: `kill-switch active: ${killSwitch.getState().reason}`,
          module: "kill-switch",
        };
      }

      // トレーディングコンテンツフィルタ
      const filterResult = filterTradingContent(text, cfg.tradingFilterThreshold);
      if (filterResult.blocked) {
        // キルスイッチにも通知
        killSwitch.checkMessage(text);
        logger?.warn(`[safety] trading content blocked: ${filterResult.reason}`);
        return {
          allowed: false,
          reason: filterResult.reason,
          module: "trading-filter",
        };
      }

      return { allowed: true };
    },

    checkRequest(): SafetyCheckResult {
      if (!cfg.enabled) {
        return { allowed: true };
      }

      // キルスイッチチェック
      if (!killSwitch.isOperationAllowed()) {
        return {
          allowed: false,
          reason: `kill-switch active: ${killSwitch.getState().reason}`,
          module: "kill-switch",
        };
      }

      // レートリミッターチェック
      const rateResult = rateLimiter.checkRequest();
      if (!rateResult.allowed) {
        // レート超過をキルスイッチにも記録
        killSwitch.recordApiCall();
        logger?.warn(
          `[safety] rate limit exceeded: ${rateResult.limitType}, retry after ${rateResult.retryAfterMs}ms`,
        );
        return {
          allowed: false,
          reason: `rate limit exceeded (${rateResult.limitType}), retry after ${Math.ceil(rateResult.retryAfterMs / 1000)}s`,
          module: "rate-limiter",
        };
      }

      // API呼び出し記録
      killSwitch.recordApiCall();

      return { allowed: true };
    },

    checkSessionIsolation(sourceSession: string, targetSession: string): SafetyCheckResult {
      if (!cfg.enabled) {
        return { allowed: true };
      }

      const result = checkContextIsolation(sourceSession, targetSession, cfg.isolationPolicy);
      if (result.violated) {
        logger?.warn(`[safety] context isolation violation: ${result.message}`);
        return {
          allowed: false,
          reason: result.message,
          module: "context-isolation",
        };
      }

      return { allowed: true };
    },

    recordError(error: string): void {
      if (cfg.enabled) {
        killSwitch.recordError(error);
      }
    },

    getKillSwitchState() {
      return killSwitch.getState();
    },

    getRateLimiterUsage() {
      return rateLimiter.getUsage();
    },

    resetKillSwitch() {
      killSwitch.reset();
      logger?.warn("[safety] kill-switch manually reset");
    },

    isEnabled() {
      return cfg.enabled;
    },
  };
}
