import {
  TypeSafeClient,
  type EntryType,
  type JsonValue,
  type Questions,
  type SystemOneResult,
} from "@typesafe-ai/sdk";

import type { AppConfig } from "./config.js";
import { missingApiKeyError } from "./errors.js";

export type SystemOneCall = (input: {
  state: unknown;
  questions: Questions;
  model?: string;
}) => Promise<SystemOneResult<Questions>>;

const stderrLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (message: string, ...args: unknown[]) => {
    console.error(message, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(message, ...args);
  },
};

export function createSystemOne(config: AppConfig): SystemOneCall {
  let client: TypeSafeClient | undefined;

  return async (input) => {
    if (!config.apiKeySet || !config.apiKey) {
      throw missingApiKeyError();
    }
    client ??= new TypeSafeClient({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultModel: config.model,
      timeout: config.timeoutMs,
      logLevel: "error",
      logger: stderrLogger,
    });
    return client.systemOne(
      {
        state: asEntryState(input.state),
        questions: input.questions,
        model: input.model ?? config.model,
      },
      { timeout: config.timeoutMs },
    );
  };
}

function asEntryState(state: unknown): EntryType {
  if (state === null || typeof state === "string" || Array.isArray(state)) {
    return state as EntryType;
  }
  if (state && typeof state === "object") {
    return state as { [key: string]: JsonValue };
  }
  throw new Error("Pack state must be a JSON object, array, string, or null.");
}
