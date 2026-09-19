import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { getPack, questionsFor } from "../src/packs/index.js";
import { NONE_OPTION } from "../src/packs/catalog-choice.js";

test("review_diff describe and example stay internally consistent", () => {
  const pack = getPack("review_diff");
  const described = handleDescribePack("review_diff");
  assert.equal(described.id, "review_diff");
  assert.equal(described.dynamic_choice_from_state, true);
  assert.deepEqual(
    pack.questions.map((question) => question.id),
    ["correctness", "security", "reliability", "compat", "test_gap", "hotspot_file", "severity"],
  );
  assert.ok(pack.notes.some((note) => /orchestration|caller/i.test(note)));
  assert.ok(!pack.questions.some((question) => question.id === "code_gate"));
});

test("review_diff builds hotspot_file from the closed files[] catalog", () => {
  const pack = getPack("review_diff");
  const questions = questionsFor(pack, pack.example_state);
  const hotspot = questions.hotspot_file;
  assert.equal(hotspot?.type, "choice");
  if (hotspot?.type !== "choice") {
    throw new Error("expected hotspot_file choice");
  }
  assert.ok(hotspot.criteria[NONE_OPTION]);
  assert.ok(hotspot.criteria["src/packs/catalog-choice.ts"]);
  assert.ok(hotspot.criteria["test/computer-use.test.ts"]);
});

test("review_diff run_pack uses mocked TypeSafe and keeps orchestration out of answers", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const pack = getPack("review_diff");
  const result = await handleRunPack(
    { pack_id: "review_diff", state: pack.example_state },
    {
      config,
      systemOne: async (input) => {
        const hotspot = input.questions.hotspot_file;
        assert.equal(hotspot?.type, "choice");
        if (hotspot?.type !== "choice") {
          throw new Error("expected hotspot_file");
        }
        assert.ok(hotspot.criteria["src/packs/catalog-choice.ts"]);
        assert.equal(input.questions.correctness?.type, "noul");
        assert.equal(input.questions.security?.type, "noul");
        assert.equal(input.questions.severity?.type, "score");
        return {
          model: "jev-latest",
          answers: {
            correctness: { type: "noul", noul: 0.2 },
            security: { type: "noul", noul: 0.05 },
            reliability: { type: "noul", noul: 0.1 },
            compat: { type: "noul", noul: 0.08 },
            test_gap: { type: "noul", noul: 0.12 },
            hotspot_file: {
              type: "choice",
              choice: "src/packs/catalog-choice.ts",
              confidence: 0.7,
              probabilities: { "src/packs/catalog-choice.ts": 0.7 },
            },
            severity: {
              type: "score",
              score: 1.1,
              confidence: 0.6,
              legend: { 0: "cosmetic", 1: "local", 2: "cross", 3: "high" },
              probabilities: { 1: 0.7 },
            },
          },
          usage: { input_tokens: 30, output_tokens: 6 },
        } as SystemOneResult<Questions>;
      },
    },
  );
  assert.equal(result.pack_id, "review_diff");
  assert.equal((result.answers as { hotspot_file: { choice: string } }).hotspot_file.choice, "src/packs/catalog-choice.ts");
  assert.equal(result.guidance, undefined);
});

test("review_diff rejects reserved file catalog entries before TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  let called = false;
  await assert.rejects(
    () =>
      handleRunPack(
        {
          pack_id: "review_diff",
          state: { diff_summary: "x", files: ["none"] },
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
