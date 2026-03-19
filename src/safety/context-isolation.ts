/**
 * コンテキスト分離 - OpenClawセッションとtrading系セッションの完全分離
 *
 * セッション間でのコンテキスト漏洩を防止する。
 * 特にtrading関連セッションからのデータがOpenClawセッションに流入しないよう保護する。
 */

/** 分離すべきセッション名のプレフィックス */
const ISOLATED_SESSION_PREFIXES = [
  "crypto",
  "trading",
  "trade",
  "bot-",
  "hyperliquid",
  "exchange",
] as const;

/** 分離ポリシーの種類 */
export type IsolationPolicy = "strict" | "warn" | "permissive";

export type IsolationCheckResult = {
  /** 分離違反があるか */
  violated: boolean;
  /** 違反の種類 */
  violationType?: "cross-session" | "context-leak" | "shared-memory";
  /** 違反元セッション */
  sourceSession?: string;
  /** 違反先セッション */
  targetSession?: string;
  /** 詳細メッセージ */
  message?: string;
};

/**
 * セッション名がトレーディング関連かどうか判定する
 */
export function isTradingSession(sessionKey: string): boolean {
  if (!sessionKey || typeof sessionKey !== "string") {
    return false;
  }
  const lower = sessionKey.toLowerCase();
  return ISOLATED_SESSION_PREFIXES.some(
    (prefix) =>
      lower.startsWith(prefix) || lower.includes(`-${prefix}`) || lower.includes(`_${prefix}`),
  );
}

/**
 * 2つのセッション間のコンテキスト共有が許可されているか検査する
 */
export function checkContextIsolation(
  sourceSession: string,
  targetSession: string,
  policy: IsolationPolicy = "strict",
): IsolationCheckResult {
  if (policy === "permissive") {
    return { violated: false };
  }

  const sourceIsTrading = isTradingSession(sourceSession);
  const targetIsTrading = isTradingSession(targetSession);

  // 両方tradingまたは両方非tradingなら許可
  if (sourceIsTrading === targetIsTrading) {
    return { violated: false };
  }

  // trading <-> 非trading間のコンテキスト共有は違反
  return {
    violated: true,
    violationType: "cross-session",
    sourceSession,
    targetSession,
    message: `Context isolation violation: trading session "${sourceSession}" and non-trading session "${targetSession}" must not share context. Policy: ${policy}.`,
  };
}

/**
 * メモリキーがトレーディング関連のコンテンツを含んでいないか検査する
 */
export function checkMemoryIsolation(memoryKey: string, sessionKey: string): IsolationCheckResult {
  const memoryIsTrading = isTradingSession(memoryKey);
  const sessionIsTrading = isTradingSession(sessionKey);

  if (memoryIsTrading && !sessionIsTrading) {
    return {
      violated: true,
      violationType: "shared-memory",
      sourceSession: memoryKey,
      targetSession: sessionKey,
      message: `Memory isolation violation: trading memory "${memoryKey}" accessed from non-trading session "${sessionKey}".`,
    };
  }

  return { violated: false };
}
