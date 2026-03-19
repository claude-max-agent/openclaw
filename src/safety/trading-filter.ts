/**
 * Trading/Crypto Bot暴走防止 - 入力フィルタリング
 *
 * トレーディングBot関連のログやメッセージがOpenClawに流入することを検出・ブロックする。
 * 以前の暴走事故（crypto-botのログがOpenClawに流れて暴走）の再発防止。
 */

/** トレーディング関連キーワード（大文字小文字無視で検出） */
const TRADING_KEYWORDS = [
  // 取引アクション
  "buy order",
  "sell order",
  "market order",
  "limit order",
  "stop loss",
  "take profit",
  "liquidat",
  "margin call",
  "open position",
  "close position",
  "place order",
  "cancel order",
  "order filled",
  "order executed",

  // 取引所・プラットフォーム
  "hyperliquid",
  "binance",
  "coinbase",
  "bybit",
  "okx",
  "kraken",
  "dex swap",
  "cex",

  // 暗号資産取引固有
  "trading pair",
  "spot trading",
  "futures trading",
  "perpetual",
  "leverage",
  "funding rate",
  "unrealized pnl",
  "realized pnl",

  // Bot固有ログパターン
  "crypto-bot",
  "trading-bot",
  "trade_signal",
  "signal_strength",
  "entry_price",
  "exit_price",
  "position_size",
  "portfolio_value",
  "balance_change",
  "wallet_balance",
] as const;

/** 高リスクパターン（正規表現）: Bot出力ログの典型パターン */
const HIGH_RISK_PATTERNS = [
  // JSON形式の取引ログ
  /\{"(?:action|side|type)":\s*"(?:buy|sell|long|short)"/i,
  // 価格・数量パターン
  /(?:price|amount|quantity|size)[:=]\s*[\d.]+\s*(?:USD|USDT|BTC|ETH)/i,
  // APIキー・シークレットのリーク
  /(?:api[_-]?key|api[_-]?secret|private[_-]?key)\s*[=:]\s*["']?[A-Za-z0-9_]{16,}/i,
  // ウォレットアドレス
  /0x[a-fA-F0-9]{40}/,
  // 取引実行ログ
  /(?:executed|placing|submitted)\s+(?:buy|sell|long|short)\s+order/i,
  // PnLレポート
  /(?:profit|loss|pnl)[:\s]+[+-]?\$?[\d,.]+/i,
] as const;

export type TradingFilterResult = {
  blocked: boolean;
  /** 検出されたキーワード一覧 */
  matchedKeywords: string[];
  /** 検出された高リスクパターン一覧 */
  matchedPatterns: string[];
  /** リスクスコア (0-100) */
  riskScore: number;
  /** ブロック理由（blocked=true時） */
  reason?: string;
};

/**
 * テキストからトレーディング関連コンテンツを検出する
 * @param input 検査対象テキスト
 * @param threshold ブロック閾値（デフォルト: 30）
 */
export function filterTradingContent(input: string, threshold = 30): TradingFilterResult {
  if (!input || typeof input !== "string") {
    return { blocked: false, matchedKeywords: [], matchedPatterns: [], riskScore: 0 };
  }

  const lowerInput = input.toLowerCase();
  const matchedKeywords: string[] = [];
  const matchedPatterns: string[] = [];

  // キーワードマッチ（各10点）
  for (const keyword of TRADING_KEYWORDS) {
    if (lowerInput.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }

  // 高リスクパターンマッチ（各25点）
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(input)) {
      matchedPatterns.push(pattern.source);
    }
  }

  const riskScore = Math.min(100, matchedKeywords.length * 10 + matchedPatterns.length * 25);

  const blocked = riskScore >= threshold;
  const reason = blocked
    ? `Trading content detected (score: ${riskScore}/${threshold}). Keywords: [${matchedKeywords.join(", ")}]. Patterns: ${matchedPatterns.length} matches.`
    : undefined;

  return { blocked, matchedKeywords, matchedPatterns, riskScore, reason };
}

/**
 * 入力テキストの配列を一括フィルタリングする
 */
export function filterTradingBatch(
  inputs: string[],
  threshold = 30,
): { results: TradingFilterResult[]; anyBlocked: boolean } {
  const results = inputs.map((input) => filterTradingContent(input, threshold));
  const anyBlocked = results.some((r) => r.blocked);
  return { results, anyBlocked };
}
