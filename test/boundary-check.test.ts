import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { getPack } from "../src/packs/index.js";

test("boundary_check describe stays internally consistent", () => {
  const pack = getPack("boundary_check");
  const described = handleDescribePack("boundary_check");
  assert.equal(described.id, "boundary_check");
  assert.equal(described.dynamic_choice_from_state, false);
  assert.deepEqual(
    pack.questions.map((question) => question.id),
    ["crosses_layer", "leaks_domain_to_ui", "leaks_infra_to_domain", "boundary_risk", "fix"],
  );
  const fix = pack.questions.find((question) => question.id === "fix");
  assert.equal(fix?.type, "choice");
  if (fix?.type === "choice") {
    assert.deepEqual(Object.keys(fix.criteria).sort(), ["extract", "keep", "move_layer", "unclear"]);
  }
  assert.ok(pack.notes.some((note) => /signals only|caller/i.test(note)));
  assert.doesNotMatch(JSON.stringify(pack.example_state), /Amarilla|plata\/horas|\/Users\/|Desktop\//i);
});

test("boundary_check run_pack uses mocked TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const pack = getPack("boundary_check");
  const result = await handleRunPack(
    { pack_id: "boundary_check", state: pack.example_state },
    {
      config,
      systemOne: async (input) => {
        assert.deepEqual(input.state, pack.example_state);
        assert.equal(input.questions.crosses_layer?.type, "noul");
        assert.equal(input.questions.leaks_domain_to_ui?.type, "noul");
        assert.equal(input.questions.leaks_infra_to_domain?.type, "noul");
        assert.equal(input.questions.boundary_risk?.type, "score");
        assert.equal(input.questions.fix?.type, "choice");
        return {
          model: "jev-latest",
          answers: {
            crosses_layer: { type: "noul", noul: 0.86 },
            leaks_domain_to_ui: { type: "noul", noul: 0.8 },
            leaks_infra_to_domain: { type: "noul", noul: 0.77 },
            boundary_risk: {
              type: "score",
              score: 2.2,
              confidence: 0.65,
              legend: { 0: "clean", 1: "local", 2: "leak", 3: "systemic" },
              probabilities: { 2: 0.7 },
            },
            fix: {
              type: "choice",
              choice: "extract",
              confidence: 0.68,
              probabilities: { extract: 0.68, move_layer: 0.2, keep: 0.08, unclear: 0.04 },
            },
          },
          usage: { input_tokens: 18, output_tokens: 5 },
        } as SystemOneResult<Questions>;
      },
    },
  );
  assert.equal(result.pack_id, "boundary_check");
  assert.equal((result.answers as { fix: { choice: string } }).fix.choice, "extract");
});

test("boundary_check rejects missing module before TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  let called = false;
  await assert.rejects(
    () =>
      handleRunPack(
        { pack_id: "boundary_check", state: { imports: [], exports: [] } },
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
