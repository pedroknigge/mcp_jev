import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { getPack } from "../src/packs/index.js";
import { validatePackState } from "../src/validate.js";

test("live_url_check describe stays internally consistent", () => {
  const pack = getPack("live_url_check");
  const described = handleDescribePack("live_url_check");
  assert.equal(described.id, "live_url_check");
  assert.equal(described.dynamic_choice_from_state, false);
  assert.deepEqual(
    pack.questions.map((question) => question.id),
    [
      "is_real_break",
      "is_expected_auth_or_redirect",
      "likely_regression_from_recent_change",
      "severity",
      "primary_failure_kind",
      "next_action",
    ],
  );
  const kind = pack.questions.find((question) => question.id === "primary_failure_kind");
  assert.equal(kind?.type, "choice");
  if (kind?.type === "choice") {
    assert.deepEqual(Object.keys(kind.criteria).sort(), [
      "auth",
      "client_error",
      "connection",
      "not_found",
      "ok",
      "other",
      "redirect",
      "server_error",
      "timeout",
    ]);
  }
  const action = pack.questions.find((question) => question.id === "next_action");
  assert.equal(action?.type, "choice");
  if (action?.type === "choice") {
    assert.deepEqual(Object.keys(action.criteria).sort(), [
      "check_auth",
      "fix_route",
      "fix_server",
      "ignore",
      "investigate_redirect",
      "none",
      "open_browser",
    ]);
  }
  assert.ok(pack.when_to_use.includes("mcp_jev urlcheck"));
  assert.ok(pack.notes.some((note) => /never makes HTTP|HTTP stays in the harness/i.test(note)));
  assert.ok(pack.notes.some((note) => /code gate|Thresholds live in caller/i.test(note)));
  assert.doesNotMatch(JSON.stringify(pack.example_state), /Amarilla|plata\/horas|\/Users\/|Desktop\//i);
  assert.doesNotThrow(() => validatePackState(pack, pack.example_state));
});

test("live_url_check run_pack uses mocked TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const pack = getPack("live_url_check");
  const result = await handleRunPack(
    { pack_id: "live_url_check", state: pack.example_state },
    {
      config,
      systemOne: async (input) => {
        assert.deepEqual(input.state, pack.example_state);
        assert.equal(input.questions.is_real_break?.type, "noul");
        assert.equal(input.questions.is_expected_auth_or_redirect?.type, "noul");
        assert.equal(input.questions.likely_regression_from_recent_change?.type, "noul");
        assert.equal(input.questions.severity?.type, "score");
        assert.equal(input.questions.primary_failure_kind?.type, "choice");
        assert.equal(input.questions.next_action?.type, "choice");
        return {
          model: "jev-latest",
          answers: {
            is_real_break: { type: "noul", noul: 0.88 },
            is_expected_auth_or_redirect: { type: "noul", noul: 0.1 },
            likely_regression_from_recent_change: { type: "noul", noul: 0.72 },
            severity: {
              type: "score",
              score: 2.7,
              confidence: 0.7,
              legend: { 0: "noise", 1: "local", 2: "material", 3: "block" },
              probabilities: { 3: 0.6 },
            },
            primary_failure_kind: {
              type: "choice",
              choice: "server_error",
              confidence: 0.8,
              probabilities: { server_error: 0.8, other: 0.2 },
            },
            next_action: {
              type: "choice",
              choice: "fix_server",
              confidence: 0.74,
              probabilities: { fix_server: 0.74, none: 0.26 },
            },
          },
          usage: { input_tokens: 20, output_tokens: 6 },
        } as SystemOneResult<Questions>;
      },
    },
  );
  assert.equal(result.pack_id, "live_url_check");
  assert.equal((result.answers as { next_action: { choice: string } }).next_action.choice, "fix_server");
});

test("live_url_check rejects missing url/path before TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  let called = false;
  await assert.rejects(
    () =>
      handleRunPack(
        { pack_id: "live_url_check", state: { method: "GET", error_class: "ok" } },
        {
          config,
          systemOne: async () => {
            called = true;
            throw new Error("should not be called");
          },
        },
      ),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state",
  );
  assert.equal(called, false);
});

test("live_url_check rejects unknown error_class and extra fields", () => {
  const pack = getPack("live_url_check");
  assert.throws(
    () => validatePackState(pack, { path: "/", method: "GET", error_class: "explode" }),
    /error_class must be one of/,
  );
  assert.throws(
    () =>
      validatePackState(pack, {
        path: "/",
        method: "GET",
        error_class: "ok",
        invented: true,
      }),
    /invented is not allowed/,
  );
});
