import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { NONE_OPTION, UNAVAILABLE_OPTION } from "../src/packs/catalog-choice.js";
import { MAX_I18N_CANDIDATES } from "../src/packs/i18n-copy.js";
import { getPack, questionsFor } from "../src/packs/index.js";
import { validatePackState } from "../src/validate.js";

test("i18n_copy describe_pack marks hottest_candidate as built from state", () => {
  const described = handleDescribePack("i18n_copy");
  assert.equal(described.version, "1.0.0");
  assert.equal(described.dynamic_choice_from_state, true);
  const questions = described.questions as Array<{ id: string; type: string; criteria?: Record<string, unknown> }>;
  assert.deepEqual(
    questions.map((question) => question.id),
    [
      "has_user_facing_hardcoded_copy",
      "should_migrate_to_i18n",
      "already_partially_internationalized",
      "i18n_debt",
      "hottest_candidate",
      "primary_bucket",
    ],
  );
  const hottest = questions.find((question) => question.id === "hottest_candidate");
  assert.equal(hottest?.type, "choice");
  assert.ok(hottest?.criteria?.[NONE_OPTION]);
  assert.ok(hottest?.criteria?.[UNAVAILABLE_OPTION]);
  assert.equal(hottest?.criteria?.login_heading, undefined);
});

test("i18n_copy builds hottest_candidate from the closed candidates catalog", () => {
  const pack = getPack("i18n_copy");
  assert.ok(pack.questionsForState);
  const questions = questionsFor(pack, pack.example_state);
  const hottest = questions.hottest_candidate;
  assert.equal(hottest?.type, "choice");
  if (hottest?.type !== "choice") {
    throw new Error("expected hottest_candidate choice");
  }
  assert.deepEqual(Object.keys(hottest.criteria).sort(), [
    "load_error",
    "login_heading",
    "none",
    "submit_btn",
  ]);
  assert.match(hottest.criteria.login_heading ?? "", /Login/);
  assert.match(hottest.criteria.submit_btn ?? "", /Submit/);
  assert.match(hottest.criteria.load_error ?? "", /Error loading/);
  assert.equal(hottest.criteria[UNAVAILABLE_OPTION], undefined);
});

test("i18n_copy example_state is a neutral Login / Submit / Error loading demo", () => {
  const pack = getPack("i18n_copy");
  const blob = JSON.stringify(pack.example_state);
  assert.match(blob, /Login/);
  assert.match(blob, /Submit/);
  assert.match(blob, /Error loading/);
  assert.doesNotMatch(blob, /tokky|broker-web|amarilla|payroll/i);
  assert.doesNotThrow(() => validatePackState(pack, pack.example_state));
});

test("i18n_copy requires path, uses_i18n_api, and candidates", () => {
  const pack = getPack("i18n_copy");
  assert.throws(
    () => validatePackState(pack, { path: "src/Login.tsx" }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /uses_i18n_api|candidates/.test(err.message),
  );
});

test("i18n_copy rejects oversized catalogs and reserved / duplicate ids", () => {
  const pack = getPack("i18n_copy");
  const tooMany = Array.from({ length: MAX_I18N_CANDIDATES + 1 }, (_, index) => ({
    id: `c${index}`,
    text: "Login",
    kind: "jsx_text",
  }));
  assert.throws(
    () => validatePackState(pack, { path: "src/A.tsx", uses_i18n_api: false, candidates: tooMany }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /max 20/.test(err.message),
  );

  assert.ok(pack.questionsForState);
  assert.throws(
    () =>
      pack.questionsForState?.({
        path: "src/A.tsx",
        uses_i18n_api: false,
        candidates: [{ id: "none", text: "Login", kind: "jsx_text" }],
      }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /reserved/.test(err.message),
  );
  assert.throws(
    () =>
      pack.questionsForState?.({
        path: "src/A.tsx",
        uses_i18n_api: false,
        candidates: [
          { id: "login_heading", text: "Login", kind: "jsx_text" },
          { id: "login_heading", text: "Submit", kind: "jsx_attr" },
        ],
      }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /duplicate/.test(err.message),
  );
});

test("i18n_copy rejects unknown language / framework / kind via schema", () => {
  const pack = getPack("i18n_copy");
  assert.throws(
    () =>
      validatePackState(pack, {
        path: "src/A.tsx",
        language: "python",
        uses_i18n_api: false,
        candidates: [],
      }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /language/.test(err.message),
  );
  assert.throws(
    () =>
      validatePackState(pack, {
        path: "src/A.tsx",
        framework_i18n: "formatjs",
        uses_i18n_api: false,
        candidates: [],
      }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /framework_i18n/.test(err.message),
  );
  assert.throws(
    () =>
      validatePackState(pack, {
        path: "src/A.tsx",
        uses_i18n_api: false,
        candidates: [{ id: "x", text: "Login", kind: "comment" }],
      }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /kind/.test(err.message),
  );
});

test("run_pack i18n_copy sends catalog-built hottest_candidate options to systemOne", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key", JEV_MODEL: "jev-latest" });
  const pack = getPack("i18n_copy");
  const state = pack.example_state;

  const result = await handleRunPack(
    { pack_id: "i18n_copy", state },
    {
      config,
      systemOne: async (input) => {
        assert.deepEqual(input.state, state);
        assert.equal(input.questions.has_user_facing_hardcoded_copy?.type, "noul");
        assert.equal(input.questions.should_migrate_to_i18n?.type, "noul");
        assert.equal(input.questions.already_partially_internationalized?.type, "noul");
        assert.equal(input.questions.i18n_debt?.type, "score");
        assert.equal(input.questions.primary_bucket?.type, "choice");
        const hottest = input.questions.hottest_candidate;
        assert.equal(hottest?.type, "choice");
        if (hottest?.type !== "choice") {
          throw new Error("expected hottest_candidate choice");
        }
        assert.ok(hottest.criteria.login_heading);
        assert.ok(hottest.criteria.submit_btn);
        assert.ok(hottest.criteria.load_error);
        assert.ok(hottest.criteria[NONE_OPTION]);
        return {
          model: "jev-latest",
          answers: {
            has_user_facing_hardcoded_copy: { type: "noul", noul: 0.9 },
            should_migrate_to_i18n: { type: "noul", noul: 0.85 },
            already_partially_internationalized: { type: "noul", noul: 0.2 },
            i18n_debt: {
              type: "score",
              score: 2.4,
              confidence: 0.7,
              legend: { 0: "clean", 1: "local", 2: "cross", 3: "block" },
              probabilities: { 2: 0.6 },
            },
            hottest_candidate: {
              type: "choice",
              choice: "login_heading",
              confidence: 0.8,
              probabilities: { login_heading: 0.8, submit_btn: 0.1, load_error: 0.05, none: 0.05 },
            },
            primary_bucket: {
              type: "choice",
              choice: "ui_copy",
              confidence: 0.75,
              probabilities: { ui_copy: 0.75 },
            },
          },
          usage: { input_tokens: 12, output_tokens: 6 },
        } as SystemOneResult<Questions>;
      },
    },
  );

  assert.equal(result.pack_id, "i18n_copy");
  assert.equal(result.pack_version, pack.version);
  const answers = result.answers as { hottest_candidate: { choice: string }; primary_bucket: { choice: string } };
  assert.equal(answers.hottest_candidate.choice, "login_heading");
  assert.equal(answers.primary_bucket.choice, "ui_copy");
});
