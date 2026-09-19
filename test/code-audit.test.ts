import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { MAX_EXCERPT_CHARS, MAX_TOP_IMPORTS } from "../src/packs/code-audit.js";
import { NONE_OPTION } from "../src/packs/catalog-choice.js";
import { getPack, questionsFor } from "../src/packs/index.js";

const MODE_A_QUESTION_IDS = [
  "wrong_layer",
  "blast_radius",
  "missing_verification",
  "secret_or_credential_risk",
  "inefficiency",
  "dead_or_premature_abstraction",
  "problem_severity",
  "change_cost",
  "primary_concern",
];

function modeAAnswers(): SystemOneResult<Questions>["answers"] {
  return {
    wrong_layer: { type: "noul", noul: 0.1 },
    blast_radius: { type: "noul", noul: 0.2 },
    missing_verification: { type: "noul", noul: 0.7 },
    secret_or_credential_risk: { type: "noul", noul: 0.05 },
    inefficiency: { type: "noul", noul: 0.08 },
    dead_or_premature_abstraction: { type: "noul", noul: 0.12 },
    problem_severity: {
      type: "score",
      score: 1.2,
      confidence: 0.6,
      legend: { 0: "clean", 1: "local", 2: "cross", 3: "block" },
      probabilities: { 1: 0.7 },
    },
    change_cost: {
      type: "score",
      score: 0.8,
      confidence: 0.65,
      legend: { 0: "cheap", 1: "module", 2: "cross", 3: "risky" },
      probabilities: { 1: 0.6 },
    },
    primary_concern: {
      type: "choice",
      choice: "verification",
      confidence: 0.72,
      probabilities: { verification: 0.72 },
    },
  };
}

test("code_audit describe and example stay internally consistent", () => {
  const pack = getPack("code_audit");
  const described = handleDescribePack("code_audit");
  assert.equal(described.id, "code_audit");
  assert.equal(described.version, "1.0.0");
  assert.equal(described.dynamic_choice_from_state, true);
  assert.deepEqual(
    pack.questions.map((question) => question.id),
    MODE_A_QUESTION_IDS,
  );
  assert.ok(pack.summary.includes("Millisecond-tier"));
  assert.ok(pack.when_to_use.includes("one run_pack per file"));
  assert.ok(pack.when_to_use.includes("repo tree"));
  assert.ok(pack.notes.some((note) => /Pass 1/i.test(note)));
  assert.ok(pack.notes.some((note) => /RTT/i.test(note)));
  assert.ok(pack.notes.some((note) => /1200/i.test(note)));
  assert.equal("excerpt" in pack.example_state, false);
  assert.ok(pack.example_state.signals && typeof pack.example_state.signals === "object");
  assert.ok(!/pstack/i.test(JSON.stringify(described)));
  assert.ok(!pack.questions.some((question) => question.id === "code_gate"));
});

test("code_audit Mode A example builds static questions without hotspot_file", () => {
  const pack = getPack("code_audit");
  const questions = questionsFor(pack, pack.example_state);
  assert.deepEqual(Object.keys(questions).sort(), [...MODE_A_QUESTION_IDS].sort());
  assert.equal(questions.primary_concern?.type, "choice");
  assert.equal(questions.hotspot_file, undefined);
  if (questions.primary_concern?.type !== "choice") {
    throw new Error("expected primary_concern choice");
  }
  assert.ok(questions.primary_concern.criteria.none);
  assert.ok(questions.primary_concern.criteria.layering);
  assert.ok(questions.primary_concern.criteria.verification);
});

test("code_audit Mode B builds hotspot_file from the closed files[] catalog", () => {
  const pack = getPack("code_audit");
  const questions = questionsFor(pack, {
    files: ["src/billing/invoice-total.ts", "src/api/invoices.ts"],
    batch_notes: "Invoice total lives in domain; API handler re-implements the sum.",
  });
  const hotspot = questions.hotspot_file;
  assert.equal(hotspot?.type, "choice");
  if (hotspot?.type !== "choice") {
    throw new Error("expected hotspot_file choice");
  }
  assert.ok(hotspot.criteria[NONE_OPTION]);
  assert.ok(hotspot.criteria["src/billing/invoice-total.ts"]);
  assert.ok(hotspot.criteria["src/api/invoices.ts"]);
  assert.equal(questions.primary_concern?.type, "choice");
});

test("code_audit prefers Mode A when path is set even if files[] is present", () => {
  const pack = getPack("code_audit");
  const questions = questionsFor(pack, {
    path: "src/billing/invoice-total.ts",
    signals: { loc: 8, has_tests_nearby: false },
    files: ["src/billing/invoice-total.ts", "src/api/invoices.ts"],
    batch_notes: "Should be ignored for question building.",
  });
  assert.equal(questions.hotspot_file, undefined);
  assert.equal(questions.primary_concern?.type, "choice");
});

test("code_audit run_pack uses mocked TypeSafe on signals-only Pass 1 state", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const pack = getPack("code_audit");
  assert.equal("excerpt" in pack.example_state, false);
  const result = await handleRunPack(
    { pack_id: "code_audit", state: pack.example_state },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.questions.wrong_layer?.type, "noul");
        assert.equal(input.questions.blast_radius?.type, "noul");
        assert.equal(input.questions.missing_verification?.type, "noul");
        assert.equal(input.questions.problem_severity?.type, "score");
        assert.equal(input.questions.change_cost?.type, "score");
        assert.equal(input.questions.primary_concern?.type, "choice");
        assert.equal(input.questions.hotspot_file, undefined);
        return {
          model: "jev-latest",
          answers: modeAAnswers(),
          usage: { input_tokens: 24, output_tokens: 8 },
        } as SystemOneResult<Questions>;
      },
    },
  );
  assert.equal(result.pack_id, "code_audit");
  assert.equal(result.pack_version, "1.0.0");
  assert.equal(
    (result.answers as { primary_concern: { choice: string } }).primary_concern.choice,
    "verification",
  );
  assert.equal(result.guidance, undefined);
});

test("code_audit Mode B run_pack builds hotspot options before TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const result = await handleRunPack(
    {
      pack_id: "code_audit",
      state: {
        files: ["src/billing/invoice-total.ts", "src/api/invoices.ts"],
        batch_notes: "Two files; no bodies.",
      },
    },
    {
      config,
      systemOne: async (input) => {
        const hotspot = input.questions.hotspot_file;
        assert.equal(hotspot?.type, "choice");
        if (hotspot?.type !== "choice") {
          throw new Error("expected hotspot_file");
        }
        assert.ok(hotspot.criteria["src/billing/invoice-total.ts"]);
        return {
          model: "jev-latest",
          answers: {
            ...modeAAnswers(),
            hotspot_file: {
              type: "choice",
              choice: "src/billing/invoice-total.ts",
              confidence: 0.7,
              probabilities: { "src/billing/invoice-total.ts": 0.7 },
            },
          },
          usage: { input_tokens: 18, output_tokens: 6 },
        } as SystemOneResult<Questions>;
      },
    },
  );
  assert.equal(
    (result.answers as { hotspot_file: { choice: string } }).hotspot_file.choice,
    "src/billing/invoice-total.ts",
  );
});

test("code_audit rejects reserved file catalog entries before TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  let called = false;
  await assert.rejects(
    () =>
      handleRunPack(
        {
          pack_id: "code_audit",
          state: { files: ["none"], batch_notes: "x" },
        },
        {
          config,
          systemOne: async () => {
            called = true;
            throw new Error("should not be called");
          },
        },
      ),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /reserved/.test(err.message),
  );
  assert.equal(called, false);
});

test("code_audit rejects empty state and oversized Pass-2 excerpt", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  let called = false;
  const deps = {
    config,
    systemOne: async () => {
      called = true;
      throw new Error("should not be called");
    },
  };
  await assert.rejects(
    () => handleRunPack({ pack_id: "code_audit", state: {} }, deps),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /Mode A/.test(err.message),
  );
  await assert.rejects(
    () =>
      handleRunPack(
        {
          pack_id: "code_audit",
          state: { path: "src/a.ts", excerpt: "x".repeat(MAX_EXCERPT_CHARS + 1) },
        },
        deps,
      ),
    (err: unknown) =>
      err instanceof ToolError &&
      err.code === "invalid_state" &&
      err.message.includes(String(MAX_EXCERPT_CHARS)) &&
      /Pass 1 is signals-only/.test(err.message),
  );
  await assert.rejects(
    () =>
      handleRunPack(
        {
          pack_id: "code_audit",
          state: {
            path: "src/a.ts",
            signals: { top_imports: Array.from({ length: MAX_TOP_IMPORTS + 1 }, (_, i) => `mod${i}`) },
          },
        },
        deps,
      ),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /top_imports/.test(err.message),
  );
  assert.equal(called, false);
});

test("code_audit accepts signals-only path (Pass 1) and a short Pass-2 excerpt", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const deps = {
    config,
    systemOne: async () =>
      ({
        model: "jev-latest",
        answers: modeAAnswers(),
        usage: { input_tokens: 4, output_tokens: 2 },
      }) as SystemOneResult<Questions>,
  };
  const pass1 = await handleRunPack({ pack_id: "code_audit", state: { path: "src/a.ts" } }, deps);
  assert.equal(pass1.pack_id, "code_audit");
  const pass2 = await handleRunPack(
    {
      pack_id: "code_audit",
      state: { path: "src/a.ts", excerpt: "export const x = 1;" },
    },
    deps,
  );
  assert.equal(pass2.pack_id, "code_audit");
});
