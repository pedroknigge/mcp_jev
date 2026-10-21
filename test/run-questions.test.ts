import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("parseCustomRunInput accepts score levels and choice options aliases", () => {
  const viaLevels = parseCustomRunInput({
    state: { cmd: "rm -rf /" },
    questions: [
      {
        id: "blast_radius",
        type: "score",
        instructions: "How bad if wrong?",
        levels: ["local", "team", "prod"],
      },
      {
        id: "action",
        type: "choice",
        instructions: "Gate",
        options: {
          allow: "run",
          ask_user: "confirm",
          refuse: "stop",
        },
      },
    ],
  });
  assert.deepEqual(
    (viaLevels.questions.find((q) => q.id === "blast_radius") as { criteria: string[] }).criteria,
    ["local", "team", "prod"],
  );
  assert.deepEqual(
    Object.keys(
      (viaLevels.questions.find((q) => q.id === "action") as { criteria: Record<string, string> }).criteria,
    ).sort(),
    ["allow", "ask_user", "refuse"],
  );
});

test("parseCustomRunInput accepts prompt → instructions alias", () => {
  const viaPrompt = parseCustomRunInput({
    state: { command: "git push --force origin main" },
    questions: [
      {
        id: "requires_human_gate",
        type: "noul",
        prompt: "Does this command require an explicit human gate before any agent may run it?",
      },
      {
        id: "blast",
        type: "score",
        prompt: "Blast radius if the command runs successfully.",
        levels: ["noop", "local_only", "shared_remote", "prod_irreversible"],
      },
      {
        id: "gate",
        type: "choice",
        prompt: "What should the harness do next?",
        options: {
          ask_user: "Pause and ask the user to approve",
          block: "Hard-block; do not run",
        },
      },
    ],
  });
  const noul = viaPrompt.questions.find((q) => q.id === "requires_human_gate") as {
    instructions: string;
  };
  assert.equal(
    noul.instructions,
    "Does this command require an explicit human gate before any agent may run it?",
  );
  assert.deepEqual(
    (viaPrompt.questions.find((q) => q.id === "blast") as { criteria: string[] }).criteria,
    ["noop", "local_only", "shared_remote", "prod_irreversible"],
  );
  assert.deepEqual(
    Object.keys(
      (viaPrompt.questions.find((q) => q.id === "gate") as { criteria: Record<string, string> }).criteria,
    ).sort(),
    ["ask_user", "block"],
  );
});

test("parseCustomRunInput rejects conflicting instructions and prompt", () => {
  assert.throws(
    () =>
      parseCustomRunInput({
        state: { x: 1 },
        questions: [
          {
            id: "gate",
            type: "noul",
            instructions: "Canonical",
            prompt: "Alias differs",
          },
        ],
      }),
    (err: unknown) =>
      err instanceof ToolError &&
      err.code === "invalid_questions" &&
      /both instructions and prompt/.test(err.message),
  );
});

test("parseCustomRunInput rejects conflicting criteria and levels", () => {
  assert.throws(
    () =>
      parseCustomRunInput({
        state: { x: 1 },
        questions: [
          {
            id: "debt",
            type: "score",
            instructions: "Debt",
            criteria: ["a", "b"],
            levels: ["x", "y"],
          },
        ],
      }),
    (err: unknown) =>
      err instanceof ToolError &&
      err.code === "invalid_questions" &&
      /both criteria and levels/.test(err.message),
  );
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

for (const doc of ["docs/CUSTOM_JUDGMENTS.md", "skills/mcp_jev/SKILL.md"]) {
  test(`${doc} retrieve_then_judge recipe sends only supplied passage ids plus none`, async () => {
    const markdown = readFileSync(new URL(`../${doc}`, import.meta.url), "utf8");
    const example = markdown.match(/^#{2,4} [^\n]*`retrieve_then_judge`[^\n]*\n[\s\S]*?```json\n([\s\S]*?)\n```/m);
    assert.ok(example, `${doc} is missing the retrieve_then_judge JSON recipe`);
    const parsed = parseCustomRunInput(JSON.parse(example[1]));
    const passages = parsed.state.passages as Array<{ id: string; text: string }>;
    assert.equal(typeof parsed.state.claim, "string");
    assert.deepEqual(passages.map((passage) => passage.id), ["L000", "L001"]);
    assert.ok(passages.every((passage) => passage.text.length > 0));
    assert.deepEqual(
      parsed.questions.map(({ id, type }) => ({ id, type })),
      [
        { id: "passage", type: "choice" },
        { id: "evidence_sufficient", type: "noul" },
        { id: "grounding", type: "score" },
      ],
    );

    const mocked: SystemOneResult<Questions> = {
      model: "jev-latest",
      answers: {
        passage: {
          type: "choice",
          choice: "L000",
          confidence: 0.9,
          probabilities: { L000: 0.9, L001: 0.05, none: 0.05 },
        },
        evidence_sufficient: { type: "noul", noul: 0.95 },
        grounding: {
          type: "score",
          score: 2.9,
          confidence: 0.9,
          legend: { 0: "none", 1: "topical", 2: "partial", 3: "explicit" },
          probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.9 },
        },
      },
      usage: { input_tokens: 100, output_tokens: 15 },
    };
    let calls = 0;
    const result = await handleRunQuestions(parsed, {
      config: configWithKey(),
      systemOne: async (input) => {
        calls += 1;
        assert.deepEqual(input.state, parsed.state);
        assert.equal(input.model, "jev-latest");
        for (const { id, ...question } of parsed.questions) {
          assert.deepEqual(input.questions[id], question);
        }
        const passage = input.questions.passage;
        assert.ok(passage?.type === "choice");
        assert.deepEqual(Object.keys(passage.criteria), [...passages.map(({ id }) => id), "none"]);
        return mocked;
      },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, mocked);
  });
}

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
