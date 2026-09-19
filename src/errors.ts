import {
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
  TypeSafeError,
  UnprocessableEntityError,
} from "@typesafe-ai/sdk";

export class ToolError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.details = details;
  }
}

export type FriendlyError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function missingApiKeyError(): ToolError {
  return new ToolError(
    "missing_api_key",
    "TYPESAFE_API_KEY is not set. Create a key at https://console.typesafe.ai then run `mcp_jev config set-key` (stores ~/.mcp_jev/.env once). Host mcp.json should stay keyless. mcp_jev never echoes the key.",
  );
}

export function toFriendlyError(err: unknown): FriendlyError {
  if (err instanceof ToolError) {
    return err.details
      ? { code: err.code, message: err.message, details: err.details }
      : { code: err.code, message: err.message };
  }
  if (err instanceof AuthenticationError) {
    return {
      code: "auth",
      message:
        "TypeSafe rejected the API key (HTTP 401). Check TYPESAFE_API_KEY from the TypeSafe dashboard. mcp_jev does not store or print the key.",
    };
  }
  if (err instanceof RateLimitError) {
    return {
      code: "rate_limit",
      message: "TypeSafe rate-limited this request. Wait and retry; do not invent a fallback judgment.",
    };
  }
  if (err instanceof APITimeoutError) {
    return {
      code: "timeout",
      message: "TypeSafe request timed out. Retry, or shrink the pack state (especially diffs).",
    };
  }
  if (err instanceof APIConnectionError) {
    return {
      code: "connection",
      message:
        "Could not reach TypeSafe. Check network access to the API, or TYPESAFE_BASE_URL if you overrode it.",
    };
  }
  if (err instanceof BadRequestError || err instanceof UnprocessableEntityError) {
    return {
      code: "validation",
      message: `TypeSafe rejected the request: ${err.message}`,
    };
  }
  if (err instanceof TypeSafeError) {
    return { code: "typesafe", message: err.message };
  }
  if (err instanceof Error) {
    return { code: "error", message: err.message };
  }
  return { code: "unknown", message: "Unexpected error while running the pack." };
}
