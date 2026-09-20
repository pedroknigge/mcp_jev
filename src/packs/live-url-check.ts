import { ToolError } from "../errors.js";
import type { PackDefinition } from "./types.js";

export const LIVE_URL_METHODS = ["GET", "HEAD"] as const;
export const LIVE_URL_ERROR_CLASSES = [
  "ok",
  "timeout",
  "dns",
  "connection",
  "redirect_loop",
  "http_4xx",
  "http_5xx",
  "body_error_hint",
  "other",
] as const;
export const LIVE_URL_ROUTE_KINDS = ["page", "api", "asset", "unknown"] as const;
export const MAX_LIVE_URL_NOTES = 400;
export const MAX_LIVE_URL_SNIPPET = 200;

export type LiveUrlMethod = (typeof LIVE_URL_METHODS)[number];
export type LiveUrlErrorClass = (typeof LIVE_URL_ERROR_CLASSES)[number];
export type LiveUrlRouteKind = (typeof LIVE_URL_ROUTE_KINDS)[number];

function enforceLiveUrlState(state: Record<string, unknown>): void {
  const url = typeof state.url === "string" ? state.url.trim() : "";
  const path = typeof state.path === "string" ? state.path.trim() : "";
  if (!url && !path) {
    throw new ToolError(
      "invalid_state",
      "live_url_check requires `url` or `path` (optionally with `base_url`). Collect HTTP signals in the harness first.",
      { missing: ["url", "path"] },
    );
  }

  const notes = state.notes;
  if (typeof notes === "string" && notes.length > MAX_LIVE_URL_NOTES) {
    throw new ToolError(
      "invalid_state",
      `live_url_check notes is ${notes.length} chars; max ${MAX_LIVE_URL_NOTES}. Keep it to one short line.`,
      { field: "notes", max_chars: MAX_LIVE_URL_NOTES, actual_chars: notes.length },
    );
  }

  const snippet = state.body_snippet;
  if (typeof snippet === "string" && snippet.length > MAX_LIVE_URL_SNIPPET) {
    throw new ToolError(
      "invalid_state",
      `live_url_check body_snippet is ${snippet.length} chars; max ${MAX_LIVE_URL_SNIPPET}. Truncate in the harness.`,
      { field: "body_snippet", max_chars: MAX_LIVE_URL_SNIPPET, actual_chars: snippet.length },
    );
  }
}

export const liveUrlCheckPack: PackDefinition = {
  id: "live_url_check",
  version: "1.0.0",
  title: "Live URL check",
  summary:
    "Typed triage of one already-fetched URL: Nouls is_real_break / is_expected_auth_or_redirect / likely_regression_from_recent_change, Score severity (0 noise → 3 ship-blocker), Choice primary_failure_kind and next_action. Jev never hits HTTP.",
  when_to_use:
    "After a harness (`mcp_jev urlcheck`) already collected status, timing, and error_class for one URL (or you built the same closed signals yourself). Prefer this over treating a status code as the whole story. Do not use Jev to fetch localhost. If invented heads differ, use run_questions.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["method", "error_class"],
    properties: {
      base_url: {
        type: "string",
        description: "Origin the harness crawled, e.g. http://localhost:3000.",
      },
      path: {
        type: "string",
        description: "Path on that origin, e.g. /api/health. Required when `url` is omitted.",
      },
      url: {
        type: "string",
        description: "Full URL the harness requested. Alternative to `base_url` + `path`.",
      },
      method: {
        type: "string",
        description: "HTTP method the harness used.",
        enum: [...LIVE_URL_METHODS],
      },
      status: {
        type: "number",
        description: "HTTP status if a response arrived. Omit on timeout / dns / connection.",
      },
      final_url: {
        type: "string",
        description: "URL after redirects (same as `url` when there were none).",
      },
      redirect_hops: {
        type: "number",
        description: "How many redirects the harness followed.",
      },
      ms: {
        type: "number",
        description: "Harness-measured elapsed milliseconds.",
      },
      error_class: {
        type: "string",
        description: "Closed harness class. Not the Jev decision.",
        enum: [...LIVE_URL_ERROR_CLASSES],
      },
      expected_auth: {
        type: "boolean",
        description: "Caller already thinks this route should require auth. Omit if unknown.",
      },
      route_kind: {
        type: "string",
        description: "Optional caller hint: page, api, asset, or unknown.",
        enum: [...LIVE_URL_ROUTE_KINDS],
      },
      notes: {
        type: "string",
        description: `Optional short note (max ${MAX_LIVE_URL_NOTES}). Mention a recent change only when that is true.`,
        maxLength: MAX_LIVE_URL_NOTES,
      },
      body_snippet: {
        type: "string",
        description: `Optional first ~${MAX_LIVE_URL_SNIPPET} chars of the body, stripped. Harness should send this only when status ≥ 400.`,
        maxLength: MAX_LIVE_URL_SNIPPET,
      },
      content_type: {
        type: "string",
        description: "Optional Content-Type from the response.",
      },
    },
  },
  example_state: {
    base_url: "http://localhost:3000",
    path: "/api/health",
    url: "http://localhost:3000/api/health",
    method: "GET",
    status: 500,
    final_url: "http://localhost:3000/api/health",
    redirect_hops: 0,
    ms: 42,
    error_class: "http_5xx",
    expected_auth: false,
    route_kind: "api",
    notes: "Recent change to the health handler.",
    body_snippet: "Internal Server Error",
    content_type: "text/plain",
  },
  questions: [
    {
      type: "noul",
      id: "is_real_break",
      instructions:
        "Given `status`, `error_class`, `expected_auth`, `route_kind`, and `notes`, is this a real breakage (down, crash, missing required route) rather than an expected auth wall or intentional redirect?",
      criteria: {
        true: "The signals show a real break: timeout, connection, 5xx, unexpected 404, or a broken redirect.",
        false: "Expected auth, an intentional redirect, a healthy response, or not enough signal.",
      },
    },
    {
      type: "noul",
      id: "is_expected_auth_or_redirect",
      instructions:
        "Is this an expected auth wall (401/403, `expected_auth` true or unknown) or an intentional redirect (`redirect_hops`, `final_url`), given `error_class` and `status`?",
      criteria: {
        true: "Auth challenge or a deliberate redirect, not a crash.",
        false: "Not an auth/redirect story, or the redirect looks broken (loop, unexpected landing).",
      },
    },
    {
      type: "noul",
      id: "likely_regression_from_recent_change",
      instructions:
        "Do `notes` mention a recent change that likely caused this result? If `notes` do not mention a recent change, answer low/false.",
      criteria: {
        true: "Notes describe a recent change that plausibly caused this failure.",
        false: "Notes omit a recent change, or the failure looks unrelated.",
      },
    },
    {
      type: "score",
      id: "severity",
      instructions:
        "How severe is this URL result given the Nouls, `error_class`, `status`, and `route_kind`? 0 is noise; 3 is a ship-blocker.",
      criteria: [
        "Noise: healthy, or expected auth/redirect.",
        "Local: one non-critical path looks off.",
        "Material: a real user or API path is broken.",
        "Ship-blocker: core route down (5xx, timeout, connection, redirect loop).",
      ],
    },
    {
      type: "choice",
      id: "primary_failure_kind",
      instructions:
        "What is the single primary failure kind? Closed catalog only. Do not invent a tenth option. Use `ok` when nothing failed.",
      criteria: {
        connection: "Could not connect (refused, reset, or similar).",
        timeout: "The request exceeded the harness timeout.",
        not_found: "Missing route or resource (typically 404).",
        auth: "Authentication or authorization wall (typically 401/403).",
        redirect: "Redirect loop or unexpected redirect landing.",
        server_error: "Server 5xx or an application crash body.",
        client_error: "Other 4xx that is not auth or not-found.",
        ok: "Healthy: 2xx or expected outcome.",
        other: "Does not fit the closed kinds.",
      },
    },
    {
      type: "choice",
      id: "next_action",
      instructions:
        "What is the smallest next action for the harness/human? Closed catalog only. Do not invent an eighth option. Orchestration stays in the caller — Jev does not open a browser or edit routes.",
      criteria: {
        ignore: "Expected or noise; do nothing.",
        fix_route: "The path or method is wrong or missing; fix the route.",
        fix_server: "The process is down, crashing, or returning 5xx.",
        check_auth: "Confirm cookies/headers or whether the wall is intended.",
        investigate_redirect: "Inspect hops and the final landing URL.",
        open_browser: "A human should look at the page in a browser.",
        none: "No action, or not enough state to pick one.",
      },
    },
  ],
  suggested_workflow: [
    "Collect signals in code (`mcp_jev urlcheck --base http://localhost:3000` or your own fetch). Jev does not make HTTP requests.",
    "For each failure (or a small top-N), pass one URL’s closed signals to run_pack live_url_check.",
    "Read is_real_break and is_expected_auth_or_redirect first, then severity.score, then primary_failure_kind and next_action.",
    "Keep the code gate in the CLI/harness (5xx / timeout / connection / redirect_loop, optional strict 404). Jev only judges.",
    "If invented heads differ from this pack, use run_questions with the same closed signals.",
  ],
  notes: [
    "HTTP stays in the harness. This pack is judgment only — no MCP tool hits localhost.",
    "Thresholds live in caller code (`mcp_jev urlcheck` exit code). Example: hard-fail on timeout / dns / connection / redirect_loop / http_5xx; treat 401/403 as auth candidates; 404 is a fail candidate and a hard fail only with --strict-404.",
    "likely_regression_from_recent_change should stay low unless `notes` mention a recent change.",
    "Closed catalogs. Fork the pack in-repo if you need another failure kind or action.",
    "Per-URL only. Aggregate counts in the CLI; do not dump a crawl into one state object.",
  ],
  enforceState: enforceLiveUrlState,
};
