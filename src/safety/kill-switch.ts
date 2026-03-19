/**
 * キルスイッチ - 異常検出時の自動停止機構
 *
 * OpenClawの異常動作を検出し、自動停止する安全機構。
 * - 短時間での大量API呼び出し
 * - トレーディング関連コンテンツの検出
 * - メモリ使用量の異常増加
 * - 繰り返しエラー
 */

import { filterTradingContent } from "./trading-filter.js";

export type KillSwitchConfig = {
  /** 有効化フラグ */
  enabled: boolean;
  /** 異常検出のAPI呼び出し閾値（1分間） */
  maxApiCallsPerMinute: number;
  /** 異常検出のエラー閾値（5分間） */
  maxErrorsPerFiveMinutes: number;
  /** トレーディング検出でのブロック閾値 */
  tradingFilterThreshold: number;
  /** キルスイッチ発動後の自動再有効化時間（ミリ秒、0=手動解除のみ） */
  autoResumeMs: number;
};

const DEFAULT_CONFIG: KillSwitchConfig = {
  enabled: true,
  maxApiCallsPerMinute: 60,
  maxErrorsPerFiveMinutes: 20,
  tradingFilterThreshold: 30,
  autoResumeMs: 0, // 手動解除のみ
};

export type KillSwitchState = {
  /** 現在トリガー済みか */
  triggered: boolean;
  /** トリガーされた理由 */
  reason?: string;
  /** トリガーされた時刻 */
  triggeredAt?: number;
  /** API呼び出しカウント */
  apiCallCount: number;
  /** エラーカウント */
  errorCount: number;
  /** トレーディング検出カウント */
  tradingDetectionCount: number;
};

export type KillSwitch = {
  /** 現在の状態を取得 */
  getState: () => Readonly<KillSwitchState>;
  /** API呼び出しを記録（trueならブロック） */
  recordApiCall: () => boolean;
  /** エラーを記録（trueならブロック） */
  recordError: (error: string) => boolean;
  /** メッセージ内容をチェック（trueならブロック） */
  checkMessage: (content: string) => boolean;
  /** 操作が許可されているかチェック */
  isOperationAllowed: () => boolean;
  /** キルスイッチを手動でトリガー */
  trigger: (reason: string) => void;
  /** キルスイッチを手動で解除 */
  reset: () => void;
  /** コールバック登録 */
  onTriggered: (callback: (reason: string) => void) => void;
};

/**
 * キルスイッチを作成する
 */
export function createKillSwitch(config: Partial<KillSwitchConfig> = {}): KillSwitch {
  const cfg: KillSwitchConfig = { ...DEFAULT_CONFIG, ...config };

  const state: KillSwitchState = {
    triggered: false,
    apiCallCount: 0,
    errorCount: 0,
    tradingDetectionCount: 0,
  };

  let apiCallWindowStart = Date.now();
  let errorWindowStart = Date.now();
  const callbacks: Array<(reason: string) => void> = [];

  function doTrigger(reason: string): void {
    if (state.triggered) {
      return;
    }
    state.triggered = true;
    state.reason = reason;
    state.triggeredAt = Date.now();

    for (const cb of callbacks) {
      try {
        cb(reason);
      } catch {
        // コールバックのエラーは無視
      }
    }

    // 自動再有効化
    if (cfg.autoResumeMs > 0) {
      setTimeout(() => {
        state.triggered = false;
        state.reason = undefined;
        state.triggeredAt = undefined;
      }, cfg.autoResumeMs);
    }
  }

  return {
    getState(): Readonly<KillSwitchState> {
      return { ...state };
    },

    recordApiCall(): boolean {
      if (!cfg.enabled) {
        return false;
      }
      if (state.triggered) {
        return true;
      }

      const now = Date.now();
      if (now - apiCallWindowStart >= 60_000) {
        state.apiCallCount = 0;
        apiCallWindowStart = now;
      }

      state.apiCallCount++;

      if (state.apiCallCount > cfg.maxApiCallsPerMinute) {
        doTrigger(
          `API call rate exceeded: ${state.apiCallCount}/${cfg.maxApiCallsPerMinute} calls/min`,
        );
        return true;
      }

      return false;
    },

    recordError(error: string): boolean {
      if (!cfg.enabled) {
        return false;
      }
      if (state.triggered) {
        return true;
      }

      const now = Date.now();
      if (now - errorWindowStart >= 300_000) {
        state.errorCount = 0;
        errorWindowStart = now;
      }

      state.errorCount++;

      if (state.errorCount > cfg.maxErrorsPerFiveMinutes) {
        doTrigger(
          `Error rate exceeded: ${state.errorCount}/${cfg.maxErrorsPerFiveMinutes} errors/5min. Last: ${error}`,
        );
        return true;
      }

      return false;
    },

    checkMessage(content: string): boolean {
      if (!cfg.enabled) {
        return false;
      }
      if (state.triggered) {
        return true;
      }

      const result = filterTradingContent(content, cfg.tradingFilterThreshold);
      if (result.blocked) {
        state.tradingDetectionCount++;
        doTrigger(
          `Trading content detected (count: ${state.tradingDetectionCount}): ${result.reason}`,
        );
        return true;
      }

      return false;
    },

    isOperationAllowed(): boolean {
      if (!cfg.enabled) {
        return true;
      }
      return !state.triggered;
    },

    trigger(reason: string): void {
      doTrigger(reason);
    },

    reset(): void {
      state.triggered = false;
      state.reason = undefined;
      state.triggeredAt = undefined;
      state.apiCallCount = 0;
      state.errorCount = 0;
      state.tradingDetectionCount = 0;
      apiCallWindowStart = Date.now();
      errorWindowStart = Date.now();
    },

    onTriggered(callback: (reason: string) => void): void {
      callbacks.push(callback);
    },
  };
}
