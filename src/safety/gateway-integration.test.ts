import { describe, expect, it, vi } from "vitest";
import { createSafetyGateway } from "./gateway-integration.js";

describe("createSafetyGateway", () => {
  it("デフォルト設定で作成できる", () => {
    const gw = createSafetyGateway();
    expect(gw.isEnabled()).toBe(true);
  });

  it("無効化時は全て許可する", () => {
    const gw = createSafetyGateway({ enabled: false });
    expect(gw.checkIncomingMessage("buy order sell order hyperliquid").allowed).toBe(true);
    expect(gw.checkRequest().allowed).toBe(true);
    expect(gw.checkSessionIsolation("crypto-bot", "openclaw").allowed).toBe(true);
  });

  describe("checkIncomingMessage", () => {
    it("通常テキストを許可する", () => {
      const gw = createSafetyGateway();
      const result = gw.checkIncomingMessage("Hello, how are you?");
      expect(result.allowed).toBe(true);
    });

    it("トレーディングコンテンツをブロックする", () => {
      const gw = createSafetyGateway();
      const result = gw.checkIncomingMessage(
        'buy order executed on hyperliquid: {"action":"buy","amount":100}',
      );
      expect(result.allowed).toBe(false);
      expect(result.module).toBe("trading-filter");
    });

    it("キルスイッチ発動中は全メッセージをブロックする", () => {
      const gw = createSafetyGateway();
      // キルスイッチを手動発動
      gw.resetKillSwitch(); // まずリセット
      // トレーディングコンテンツでキルスイッチを発動させる
      gw.checkIncomingMessage('buy order sell order hyperliquid binance {"action":"buy"}');
      const result = gw.checkIncomingMessage("normal text");
      expect(result.allowed).toBe(false);
      expect(result.module).toBe("kill-switch");
    });
  });

  describe("checkRequest", () => {
    it("通常リクエストを許可する", () => {
      const gw = createSafetyGateway();
      const result = gw.checkRequest();
      expect(result.allowed).toBe(true);
    });

    it("レートリミット超過でブロックする", () => {
      const gw = createSafetyGateway({
        rateLimiter: {
          maxRequestsPerMinute: 3,
          maxRequestsPerHour: 100,
          maxTokensPerMinute: 100_000,
        },
      });
      // 3回は許可
      expect(gw.checkRequest().allowed).toBe(true);
      expect(gw.checkRequest().allowed).toBe(true);
      expect(gw.checkRequest().allowed).toBe(true);
      // 4回目でブロック
      const result = gw.checkRequest();
      expect(result.allowed).toBe(false);
      expect(result.module).toBe("rate-limiter");
    });
  });

  describe("checkSessionIsolation", () => {
    it("同カテゴリセッション間は許可する", () => {
      const gw = createSafetyGateway();
      expect(gw.checkSessionIsolation("openclaw-main", "openclaw-web").allowed).toBe(true);
      expect(gw.checkSessionIsolation("crypto-bot", "trading-analyzer").allowed).toBe(true);
    });

    it("trading/非trading間はブロックする", () => {
      const gw = createSafetyGateway();
      const result = gw.checkSessionIsolation("crypto-bot", "openclaw-main");
      expect(result.allowed).toBe(false);
      expect(result.module).toBe("context-isolation");
    });

    it("permissiveポリシーでは許可する", () => {
      const gw = createSafetyGateway({ isolationPolicy: "permissive" });
      expect(gw.checkSessionIsolation("crypto-bot", "openclaw-main").allowed).toBe(true);
    });
  });

  describe("recordError", () => {
    it("大量エラーでキルスイッチが発動する", () => {
      const gw = createSafetyGateway({
        killSwitch: { maxErrorsPerFiveMinutes: 3 },
      });
      gw.recordError("error 1");
      gw.recordError("error 2");
      gw.recordError("error 3");
      gw.recordError("error 4"); // 閾値超過
      expect(gw.getKillSwitchState().triggered).toBe(true);
      expect(gw.checkRequest().allowed).toBe(false);
    });
  });

  describe("ログ出力", () => {
    it("ブロック時にloggerを呼び出す", () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const gw = createSafetyGateway({}, logger);
      gw.checkIncomingMessage('buy order sell order hyperliquid {"action":"buy"}');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("[safety] trading content blocked"),
      );
    });
  });
});
