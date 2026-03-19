import { describe, expect, it } from "vitest";
import { createProviderUsageFetch, makeResponse } from "../test-utils/provider-usage-fetch.js";
import { fetchClaudeUsage } from "./provider-usage.fetch.claude.js";

const MISSING_SCOPE_MESSAGE = "missing scope requirement user:profile";

describe("fetchClaudeUsage", () => {
  it("parses oauth usage windows", async () => {
    const fiveHourReset = "2026-01-08T00:00:00Z";
    const weekReset = "2026-01-12T00:00:00Z";
    const mockFetch = createProviderUsageFetch(async (_url, init) => {
      const headers = (init?.headers as Record<string, string> | undefined) ?? {};
      expect(headers.Authorization).toBe("Bearer token");
      expect(headers["anthropic-beta"]).toBe("oauth-2025-04-20");

      return makeResponse(200, {
        five_hour: { utilization: 18, resets_at: fiveHourReset },
        seven_day: { utilization: 54, resets_at: weekReset },
        seven_day_sonnet: { utilization: 67 },
      });
    });

    const result = await fetchClaudeUsage("token", 5000, mockFetch);

    expect(result.windows).toEqual([
      { label: "5h", usedPercent: 18, resetAt: new Date(fiveHourReset).getTime() },
      { label: "Week", usedPercent: 54, resetAt: new Date(weekReset).getTime() },
      { label: "Sonnet", usedPercent: 67 },
    ]);
  });

  it("clamps oauth usage windows and prefers sonnet over opus when both exist", async () => {
    const mockFetch = createProviderUsageFetch(async () =>
      makeResponse(200, {
        five_hour: { utilization: -5 },
        seven_day: { utilization: 140 },
        seven_day_sonnet: { utilization: 40 },
        seven_day_opus: { utilization: 90 },
      }),
    );

    const result = await fetchClaudeUsage("token", 5000, mockFetch);

    expect(result.windows).toEqual([
      { label: "5h", usedPercent: 0, resetAt: undefined },
      { label: "Week", usedPercent: 100, resetAt: undefined },
      { label: "Sonnet", usedPercent: 40 },
    ]);
  });

  it("returns HTTP errors with provider message suffix", async () => {
    const mockFetch = createProviderUsageFetch(async () =>
      makeResponse(403, {
        error: { message: "scope not granted" },
      }),
    );

    const result = await fetchClaudeUsage("token", 5000, mockFetch);
    expect(result.error).toBe("HTTP 403: scope not granted");
    expect(result.windows).toHaveLength(0);
  });

  it("omits blank error message suffixes on oauth failures", async () => {
    const mockFetch = createProviderUsageFetch(async () =>
      makeResponse(403, {
        error: { message: "   " },
      }),
    );

    const result = await fetchClaudeUsage("token", 5000, mockFetch);
    expect(result.error).toBe("HTTP 403");
    expect(result.windows).toHaveLength(0);
  });

  it("keeps HTTP status errors when oauth error bodies are not JSON", async () => {
    const mockFetch = createProviderUsageFetch(async () => makeResponse(502, "bad gateway"));

    const result = await fetchClaudeUsage("token", 5000, mockFetch);
    expect(result.error).toBe("HTTP 502");
    expect(result.windows).toHaveLength(0);
  });

  it("returns error for missing scope without web session fallback", async () => {
    const mockFetch = createProviderUsageFetch(async () =>
      makeResponse(403, {
        error: { message: MISSING_SCOPE_MESSAGE },
      }),
    );

    const result = await fetchClaudeUsage("token", 5000, mockFetch);
    expect(result.error).toBe(`HTTP 403: ${MISSING_SCOPE_MESSAGE}`);
    expect(result.windows).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
