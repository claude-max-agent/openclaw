import { describe, expect, it } from "vitest";
import { createKillSwitch } from "./kill-switch.js";

describe("createKillSwitch", () => {
  it("初期状態では操作許可", () => {
    const ks = createKillSwitch();
    expect(ks.isOperationAllowed()).toBe(true);
    expect(ks.getState().triggered).toBe(false);
  });

  it("手動トリガーで停止", () => {
    const ks = createKillSwitch();
    ks.trigger("manual test");
    expect(ks.isOperationAllowed()).toBe(false);
    expect(ks.getState().triggered).toBe(true);
    expect(ks.getState().reason).toBe("manual test");
  });

  it("リセットで復旧", () => {
    const ks = createKillSwitch();
    ks.trigger("test");
    ks.reset();
    expect(ks.isOperationAllowed()).toBe(true);
    expect(ks.getState().triggered).toBe(false);
  });

  it("API呼び出し超過でトリガー", () => {
    const ks = createKillSwitch({ maxApiCallsPerMinute: 3 });
    expect(ks.recordApiCall()).toBe(false);
    expect(ks.recordApiCall()).toBe(false);
    expect(ks.recordApiCall()).toBe(false);
    // 4回目で超過
    expect(ks.recordApiCall()).toBe(true);
    expect(ks.isOperationAllowed()).toBe(false);
  });

  it("エラー超過でトリガー", () => {
    const ks = createKillSwitch({ maxErrorsPerFiveMinutes: 2 });
    expect(ks.recordError("error1")).toBe(false);
    expect(ks.recordError("error2")).toBe(false);
    expect(ks.recordError("error3")).toBe(true);
    expect(ks.isOperationAllowed()).toBe(false);
  });

  it("トレーディングコンテンツでトリガー", () => {
    const ks = createKillSwitch({ tradingFilterThreshold: 10 });
    const blocked = ks.checkMessage("crypto-bot: buy order executed on hyperliquid");
    expect(blocked).toBe(true);
    expect(ks.getState().tradingDetectionCount).toBe(1);
  });

  it("通常メッセージはトリガーしない", () => {
    const ks = createKillSwitch();
    expect(ks.checkMessage("Hello, how are you?")).toBe(false);
    expect(ks.isOperationAllowed()).toBe(true);
  });

  it("無効時はブロックしない", () => {
    const ks = createKillSwitch({ enabled: false });
    ks.recordApiCall();
    ks.recordApiCall();
    ks.recordApiCall();
    expect(ks.isOperationAllowed()).toBe(true);
  });

  it("コールバックがトリガー時に呼ばれる", () => {
    const ks = createKillSwitch();
    let calledWith = "";
    ks.onTriggered((reason) => {
      calledWith = reason;
    });
    ks.trigger("test callback");
    expect(calledWith).toBe("test callback");
  });

  it("トリガー済みの場合、全ての操作がブロックされる", () => {
    const ks = createKillSwitch();
    ks.trigger("test");
    expect(ks.recordApiCall()).toBe(true);
    expect(ks.recordError("err")).toBe(true);
    expect(ks.checkMessage("hello")).toBe(true);
  });
});
