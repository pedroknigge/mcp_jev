import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { parseCustomRunInput } from "../src/custom-questions.js";
import { ToolError } from "../src/errors.js";
import { handleRunQuestions } from "../src/handlers.js";
import { MAX_CHOICE_OPTIONS } from "../src/packs/catalog-choice.js";

const changelogState = {
  path: "src/api/client.ts",
  change_summary: "Renamed fetchUser to getUser and dropped the locale argument.",
  symbols: [
    { id: "fetchUser", kind: "export", note: "removed" },
    { id: "getUser", kind: "export", note: "added; no locale arg" },
    { id: "ClientOptions", kind: "type", note: "unchanged" },
  ],
};

const changelogQuestions = [
  {
    id: "is_breaking_for_callers",
    type: "noul",
    instructions:
      "Does `change_summary` plus `symbols` at `path` break existing callers (removed export, changed arity, or incompatible type)?",
    criteria: {
      true: "At least one caller-visible contract change is breaking.",
      false: "Compatible rename/add, or only internal symbols moved.",
    },
  },
  {
    id: "doc_debt",
    type: "score",
    instructions: "How much public-doc / changelog debt does this change create?",
    criteria: [
      "No public contract change; changelog optional.",
      "Small note: rename or added optional field.",
      "Needs a migration blurb for callers.",
      "Ship-blocker: undocumented breaking change.",
    ],
  },
  {
    id: "hottest_symbol",
    type: "choice",
    instructions: "Which symbol should the changelog mention first? Options are `symbols[].id` plus `none`.",
    criteria: {
      fetchUser: "Removed export — callers still import this name.",
      getUser: "New export with a dropped argument.",
      ClientOptions: "Unchanged type.",
      none: "No symbol needs a changelog mention.",
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
        { state: changelogState, questions: changelogQuestions },
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
    { label: "missing questions", input: { state: changelogState } },
    { label: "empty questions", input: { state: changelogState, questions: [] } },
    { label: "unknown type", input: { state: changelogState, questions: [{ id: "x", type: "essay", instructions: "Write a review", criteria: {} }] } },
    {
      label: "one choice option",
      input: {
        state: changelogState,
        questions: [{ id: "pick", type: "choice", instructions: "Pick one", criteria: { only: "one option" } }],
      },
    },
    {
      label: "one score level",
      input: {
        state: changelogState,
        questions: [{ id: "debt", type: "score", instructions: "How bad", criteria: ["fine"] }],
      },
    },
    {
      label: "duplicate ids",
      input: {
        state: changelogState,
        questions: [
          { id: "dup", type: "noul", instructions: "First" },
          { id: "dup", type: "noul", instructions: "Second" },
        ],
      },
    },
    {
      label: "array state",
      input: { state: ["src/a.ts", "src/b.ts"], questions: changelogQuestions },
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
    () => parseCustomRunInput({ state: circular, questions: changelogQuestions }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state",
  );
});

test("run_questions maps a changelog-style custom judgment onto mocked systemOne", async () => {
  const config = configWithKey();
  const result = await handleRunQuestions(
    { state: changelogState, questions: changelogQuestions },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.model, "jev-latest");
        assert.deepEqual(input.state, changelogState);
        assert.equal(input.questions.is_breaking_for_callers?.type, "noul");
        assert.equal(input.questions.doc_debt?.type, "score");
        assert.equal(input.questions.hottest_symbol?.type, "choice");
        const hottest = input.questions.hottest_symbol;
        if (hottest?.type !== "choice") {
          throw new Error("expected hottest_symbol choice");
        }
        assert.deepEqual(Object.keys(hottest.criteria).sort(), ["ClientOptions", "fetchUser", "getUser", "none"]);
        return {
          model: "jev-latest",
          answers: {
            is_breaking_for_callers: { type: "noul", noul: 0.86 },
            doc_debt: {
              type: "score",
              score: 2.1,
              confidence: 0.62,
              legend: { 0: "none", 1: "small", 2: "migration", 3: "blocker" },
              probabilities: { 0: 0.05, 1: 0.2, 2: 0.7, 3: 0.05 },
            },
            hottest_symbol: {
              type: "choice",
              choice: "fetchUser",
              confidence: 0.71,
              probabilities: { fetchUser: 0.71, getUser: 0.2, ClientOptions: 0.04, none: 0.05 },
            },
          },
          usage: { input_tokens: 90, output_tokens: 14 },
        } as SystemOneResult<Questions>;
      },
    },
  );

  assert.equal(result.model, "jev-latest");
  assert.equal((result.answers as { hottest_symbol: { choice: string } }).hottest_symbol.choice, "fetchUser");
  assert.equal(
    (result.answers as { is_breaking_for_callers: { noul: number } }).is_breaking_for_callers.noul,
    0.86,
  );
  assert.deepEqual(result.usage, { input_tokens: 90, output_tokens: 14 });
  assert.equal(result.pack_id, undefined);
});

test("run_questions accepts an optional model override", async () => {
  const config = configWithKey();
  const result = await handleRunQuestions(
    { state: changelogState, questions: changelogQuestions, model: "jev-custom" },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.model, "jev-custom");
        return {
          model: "jev-custom",
          answers: {
            is_breaking_for_callers: { type: "noul", noul: 0.4 },
            doc_debt: { type: "score", score: 0.2, confidence: 0.5, legend: {}, probabilities: {} },
            hottest_symbol: { type: "choice", choice: "none", confidence: 0.6, probabilities: { none: 0.6 } },
          },
          usage: { input_tokens: 10, output_tokens: 2 },
        } as SystemOneResult<Questions>;
      },
    },
  );
  assert.equal(result.model, "jev-custom");
});
