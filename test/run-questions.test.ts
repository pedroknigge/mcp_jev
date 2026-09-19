import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { parseCustomRunInput } from "../src/custom-questions.js";
import { ToolError } from "../src/errors.js";
import { handleRunQuestions } from "../src/handlers.js";
import { MAX_CHOICE_OPTIONS } from "../src/packs/catalog-choice.js";

const i18nState = {
  path: "src/components/Welcome.tsx",
  candidates: [
    { id: "hero_title", text: "Welcome back", kind: "jsx_text" },
    { id: "cta", text: "Get started", kind: "jsx_text" },
    { id: "debug", text: "TODO: remove", kind: "comment" },
  ],
};

const i18nQuestions = [
  {
    id: "has_user_facing_hardcoded_copy",
    type: "noul",
    instructions:
      "Does `path` contain user-facing hardcoded copy among `candidates` (not comments, not identifiers)?",
    criteria: {
      true: "At least one candidate is user-visible product copy that should be extracted.",
      false: "No user-facing hardcoded copy; remaining strings are comments, identifiers, or already keyed.",
    },
  },
  {
    id: "i18n_debt",
    type: "score",
    instructions: "How much i18n debt is in `candidates` at `path`?",
    criteria: [
      "No user-facing hardcoded copy, or only already-keyed strings.",
      "A few isolated strings; easy to extract.",
      "Several user-facing strings; localization will miss them.",
      "Widespread hardcoded copy; shipping this locale-broken.",
    ],
  },
  {
    id: "hottest_candidate",
    type: "choice",
    instructions:
      "Which candidate is the hottest user-facing hardcoded string to extract first? Options are `candidates[].id` plus `none`.",
    criteria: {
      hero_title: "Welcome back — likely visible heading.",
      cta: "Get started — likely a button.",
      debug: "TODO: remove — likely a comment.",
      none: "No candidate is user-facing hardcoded copy worth extracting.",
    },
  },
];

function configWithKey() {
  return loadConfig({ TYPESAFE_API_KEY: "test-key", JEV_MODEL: "jev-latest" });
}

test("run_questions refuses to call TypeSafe without a key", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "" });
  let called = false;
  await assert.rejects(
    () =>
      handleRunQuestions(
        { state: i18nState, questions: i18nQuestions },
        {
          config,
          systemOne: async () => {
            called = true;
            throw new Error("should not be called");
          },
        },
      ),
    (err: unknown) => err instanceof ToolError && err.code === "missing_api_key",
  );
  assert.equal(called, false);
});

test("run_questions validates schema before calling TypeSafe", async () => {
  const config = configWithKey();
  const cases: Array<{ label: string; input: { state?: unknown; questions?: unknown; model?: unknown } }> = [
    { label: "missing questions", input: { state: i18nState } },
    { label: "empty questions", input: { state: i18nState, questions: [] } },
    { label: "unknown type", input: { state: i18nState, questions: [{ id: "x", type: "essay", instructions: "Write a review", criteria: {} }] } },
    {
      label: "one choice option",
      input: {
        state: i18nState,
        questions: [{ id: "pick", type: "choice", instructions: "Pick one", criteria: { only: "one option" } }],
      },
    },
    {
      label: "one score level",
      input: {
        state: i18nState,
        questions: [{ id: "debt", type: "score", instructions: "How bad", criteria: ["fine"] }],
      },
    },
    {
      label: "duplicate ids",
      input: {
        state: i18nState,
        questions: [
          { id: "dup", type: "noul", instructions: "First" },
          { id: "dup", type: "noul", instructions: "Second" },
        ],
      },
    },
    {
      label: "array state",
      input: { state: ["src/a.ts", "src/b.ts"], questions: i18nQuestions },
    },
  ];

  for (const item of cases) {
    let called = false;
    await assert.rejects(
      () =>
        handleRunQuestions(item.input, {
          config,
          systemOne: async () => {
            called = true;
            throw new Error("should not be called");
          },
        }),
      (err: unknown) => err instanceof ToolError,
      item.label,
    );
    assert.equal(called, false, item.label);
  }
});

test("parseCustomRunInput enforces Choice cap and JSON state", () => {
  const tooMany: Record<string, string> = {};
  for (let i = 0; i < MAX_CHOICE_OPTIONS + 1; i += 1) {
    tooMany[`opt_${i}`] = `Option ${i}`;
  }
  assert.throws(
    () =>
      parseCustomRunInput({
        state: { path: "x" },
        questions: [{ id: "pick", type: "choice", instructions: "Pick", criteria: tooMany }],
      }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_questions" && /at most/.test(err.message),
  );

  const circular: Record<string, unknown> = { path: "x.ts" };
  circular.self = circular;
  assert.throws(
    () => parseCustomRunInput({ state: circular, questions: i18nQuestions }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state",
  );
});

test("run_questions maps an i18n-style custom judgment onto mocked systemOne", async () => {
  const config = configWithKey();
  const result = await handleRunQuestions(
    { state: i18nState, questions: i18nQuestions },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.model, "jev-latest");
        assert.deepEqual(input.state, i18nState);
        assert.equal(input.questions.has_user_facing_hardcoded_copy?.type, "noul");
        assert.equal(input.questions.i18n_debt?.type, "score");
        assert.equal(input.questions.hottest_candidate?.type, "choice");
        const hottest = input.questions.hottest_candidate;
        if (hottest?.type !== "choice") {
          throw new Error("expected hottest_candidate choice");
        }
        assert.deepEqual(Object.keys(hottest.criteria).sort(), ["cta", "debug", "hero_title", "none"]);
        return {
          model: "jev-latest",
          answers: {
            has_user_facing_hardcoded_copy: { type: "noul", noul: 0.86 },
            i18n_debt: {
              type: "score",
              score: 1.3,
              confidence: 0.62,
              legend: { 0: "none", 1: "few", 2: "several", 3: "widespread" },
              probabilities: { 0: 0.05, 1: 0.7, 2: 0.2, 3: 0.05 },
            },
            hottest_candidate: {
              type: "choice",
              choice: "hero_title",
              confidence: 0.71,
              probabilities: { hero_title: 0.71, cta: 0.2, debug: 0.04, none: 0.05 },
            },
          },
          usage: { input_tokens: 90, output_tokens: 14 },
        } as SystemOneResult<Questions>;
      },
    },
  );

  assert.equal(result.model, "jev-latest");
  assert.equal((result.answers as { hottest_candidate: { choice: string } }).hottest_candidate.choice, "hero_title");
  assert.equal(
    (result.answers as { has_user_facing_hardcoded_copy: { noul: number } }).has_user_facing_hardcoded_copy.noul,
    0.86,
  );
  assert.deepEqual(result.usage, { input_tokens: 90, output_tokens: 14 });
  assert.equal(result.pack_id, undefined);
});

test("run_questions accepts an optional model override", async () => {
  const config = configWithKey();
  const result = await handleRunQuestions(
    { state: i18nState, questions: i18nQuestions, model: "jev-custom" },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.model, "jev-custom");
        return {
          model: "jev-custom",
          answers: {
            has_user_facing_hardcoded_copy: { type: "noul", noul: 0.4 },
            i18n_debt: { type: "score", score: 0.2, confidence: 0.5, legend: {}, probabilities: {} },
            hottest_candidate: { type: "choice", choice: "none", confidence: 0.6, probabilities: { none: 0.6 } },
          },
          usage: { input_tokens: 10, output_tokens: 2 },
        } as SystemOneResult<Questions>;
      },
    },
  );
  assert.equal(result.model, "jev-custom");
});
