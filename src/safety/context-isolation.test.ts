import { describe, expect, it } from "vitest";
import {
  isTradingSession,
  checkContextIsolation,
  checkMemoryIsolation,
} from "./context-isolation.js";

describe("isTradingSession", () => {
  it("trading関連セッション名を検出する", () => {
    expect(isTradingSession("crypto-bot")).toBe(true);
    expect(isTradingSession("trading-main")).toBe(true);
    expect(isTradingSession("hyperliquid-monitor")).toBe(true);
    expect(isTradingSession("exchange-watcher")).toBe(true);
  });

  it("通常セッション名は検出しない", () => {
    expect(isTradingSession("main")).toBe(false);
    expect(isTradingSession("openclaw-assistant")).toBe(false);
    expect(isTradingSession("chat-session")).toBe(false);
  });

  it("空文字列はfalse", () => {
    expect(isTradingSession("")).toBe(false);
  });
});

describe("checkContextIsolation", () => {
  it("通常セッション間は許可", () => {
    const result = checkContextIsolation("main", "assistant");
    expect(result.violated).toBe(false);
  });

  it("trading間は許可", () => {
    const result = checkContextIsolation("crypto-bot", "trading-main");
    expect(result.violated).toBe(false);
  });

  it("trading→通常はstrict時に違反", () => {
    const result = checkContextIsolation("crypto-bot", "main", "strict");
    expect(result.violated).toBe(true);
    expect(result.violationType).toBe("cross-session");
  });

  it("通常→tradingもstrict時に違反", () => {
    const result = checkContextIsolation("main", "crypto-bot", "strict");
    expect(result.violated).toBe(true);
  });

  it("permissiveモードでは全て許可", () => {
    const result = checkContextIsolation("crypto-bot", "main", "permissive");
    expect(result.violated).toBe(false);
  });
});

describe("checkMemoryIsolation", () => {
  it("tradingメモリを非tradingセッションからアクセスすると違反", () => {
    const result = checkMemoryIsolation("crypto-data", "main");
    expect(result.violated).toBe(true);
    expect(result.violationType).toBe("shared-memory");
  });

  it("通常メモリの通常セッションアクセスは許可", () => {
    const result = checkMemoryIsolation("user-prefs", "main");
    expect(result.violated).toBe(false);
  });
});
