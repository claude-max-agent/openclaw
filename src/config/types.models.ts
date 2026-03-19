import type { OpenAICompletionsCompat } from "@mariozechner/pi-ai";
import type { SecretInput } from "./types.secrets.js";

export const MODEL_APIS = [
  "openai-completions",
  "openai-responses",
  "openai-codex-responses",
  "anthropic-messages",
  "google-generative-ai",
  "github-copilot",
  "bedrock-converse-stream",
  "ollama",
] as const;

export type ModelApi = (typeof MODEL_APIS)[number];

type SupportedOpenAICompatFields = Pick<
  OpenAICompletionsCompat,
  | "supportsStore"
  | "supportsDeveloperRole"
  | "supportsReasoningEffort"
  | "supportsUsageInStreaming"
  | "supportsStrictMode"
  | "maxTokensField"
  | "requiresToolResultName"
  | "requiresAssistantAfterToolResult"
  | "requiresThinkingAsText"
>;

type SupportedThinkingFormat =
  | NonNullable<OpenAICompletionsCompat["thinkingFormat"]>
  | "qwen-chat-template";

export type ModelCompatConfig = SupportedOpenAICompatFields & {
  thinkingFormat?: SupportedThinkingFormat;
  supportsTools?: boolean;
  toolSchemaProfile?: "xai";
  nativeWebSearchTool?: boolean;
  toolCallArgumentsEncoding?: "html-entities";
  requiresMistralToolIds?: boolean;
  requiresOpenAiAnthropicToolPayload?: boolean;
};

export type ModelProviderAuthMode = "api-key" | "aws-sdk" | "oauth" | "token";

export type ModelDefinitionConfig = {
  id: string;
  name: string;
  api?: ModelApi;
  reasoning: boolean;
  input: Array<"text" | "image">;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: ModelCompatConfig;
};

export type ModelProviderConfig = {
  baseUrl: string;
  apiKey?: SecretInput;
  auth?: ModelProviderAuthMode;
  api?: ModelApi;
  injectNumCtxForOpenAICompat?: boolean;
  headers?: Record<string, SecretInput>;
  authHeader?: boolean;
  models: ModelDefinitionConfig[];
};

/**
 * Validate that a provider baseUrl uses a safe protocol.
 * Blocks non-HTTP(S) schemes and warns on non-HTTPS in production.
 */
export function validateProviderBaseUrl(baseUrl: string): { valid: boolean; warning?: string } {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { valid: false, warning: `Invalid URL: ${baseUrl}` };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { valid: false, warning: `Unsupported protocol: ${parsed.protocol}` };
  }
  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (parsed.protocol === "http:" && !isLocalhost) {
    return {
      valid: true,
      warning: `Non-HTTPS baseUrl "${baseUrl}" — API keys may be transmitted in cleartext`,
    };
  }
  return { valid: true };
}

export type BedrockDiscoveryConfig = {
  enabled?: boolean;
  region?: string;
  providerFilter?: string[];
  refreshInterval?: number;
  defaultContextWindow?: number;
  defaultMaxTokens?: number;
};

export type ModelsConfig = {
  mode?: "merge" | "replace";
  providers?: Record<string, ModelProviderConfig>;
  bedrockDiscovery?: BedrockDiscoveryConfig;
};
