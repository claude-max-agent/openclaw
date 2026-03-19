import { describe, expect, it } from "vitest";
import { filterTradingContent, filterTradingBatch } from "./trading-filter.js";

describe("filterTradingContent", () => {
  it("通常のメッセージはブロックしない", () => {
    const result = filterTradingContent("Hello, how are you?");
    expect(result.blocked).toBe(false);
    expect(result.riskScore).toBe(0);
    expect(result.matchedKeywords).toHaveLength(0);
  });

  it("空文字列はブロックしない", () => {
    const result = filterTradingContent("");
    expect(result.blocked).toBe(false);
  });

  it("トレーディングキーワードを検出する", () => {
    const result = filterTradingContent(
      "Buy order placed on hyperliquid, stop loss at 49000, take profit at 55000",
    );
    expect(result.blocked).toBe(true);
    expect(result.matchedKeywords).toContain("buy order");
    expect(result.matchedKeywords).toContain("hyperliquid");
  });

  it("crypto-botログを検出する", () => {
    const result = filterTradingContent(
      "crypto-bot: executing trade signal_strength=0.85 entry_price=50000",
    );
    expect(result.blocked).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(30);
  });

  it("JSON形式の取引ログを検出する", () => {
    const result = filterTradingContent('{"action": "buy", "pair": "BTC/USDT", "amount": 0.1}', 20);
    expect(result.blocked).toBe(true);
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });

  it("ウォレットアドレスを検出する", () => {
    const result = filterTradingContent("Send to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD94", 20);
    expect(result.blocked).toBe(true);
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });

  it("PnLレポートを検出する", () => {
    const result = filterTradingContent("Daily profit: +$1,234.56", 20);
    expect(result.blocked).toBe(true);
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });

  it("閾値を変更できる", () => {
    const result = filterTradingContent("hyperliquid status check", 50);
    // 1キーワード = 10点 < 50なのでブロックされない
    expect(result.blocked).toBe(false);
    expect(result.matchedKeywords).toContain("hyperliquid");
  });

  it("APIキーリークパターンを検出する", () => {
    const result = filterTradingContent(
      "api_key=AAAA_BBBB_CCCC_DDDD_EEEE_FFFF_1234567890abcdef",
      20,
    );
    expect(result.blocked).toBe(true);
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });

  it("複数キーワードの複合検出でスコアが上がる", () => {
    const result = filterTradingContent(
      "crypto-bot: buy order on hyperliquid, stop loss at 49000, take profit at 55000",
    );
    expect(result.riskScore).toBeGreaterThan(30);
    expect(result.matchedKeywords.length).toBeGreaterThan(3);
  });
});

describe("filterTradingBatch", () => {
  it("複数メッセージを一括チェックする", () => {
    const { results, anyBlocked } = filterTradingBatch([
      "Hello world",
      "crypto-bot: buy order on hyperliquid stop loss triggered",
      "Nice weather today",
    ]);
    expect(results).toHaveLength(3);
    expect(anyBlocked).toBe(true);
    expect(results[0].blocked).toBe(false);
    expect(results[1].blocked).toBe(true);
    expect(results[2].blocked).toBe(false);
  });

  it("全て安全ならanyBlockedはfalse", () => {
    const { anyBlocked } = filterTradingBatch(["Hello", "World"]);
    expect(anyBlocked).toBe(false);
  });
});
