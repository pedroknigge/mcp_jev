import assert from "node:assert/strict";
import { test } from "node:test";

import { VERSION as SDK_VERSION, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleListPacks, handlePing, handleRunPack } from "../src/handlers.js";
import { getPack } from "../src/packs/registry.js";

test("list_packs returns summaries only", () => {
  const result = handleListPacks();
  const packs = result.packs as Array<Record<string, unknown>>;
  assert.equal(packs.length, 5);
  assert.ok(packs[0] && "when_to_use" in packs[0]);
  assert.ok(packs[0] && !("questions" in packs[0]));
});

test("describe_pack returns full schema and workflow", () => {
  const described = handleDescribePack("intent_router");
  assert.equal(described.id, "intent_router");
  assert.ok(Array.isArray(described.questions));
  assert.equal(described.dynamic_choice_from_state, false);
  assert.ok(described.state_schema);
  assert.ok(described.example_state);
  assert.ok(Array.isArray(described.suggested_workflow));
});

test("describe_pack marks computer_use_step as building Choice options from state", () => {
  const described = handleDescribePack("computer_use_step");
  assert.equal(described.dynamic_choice_from_state, true);
  const questions = described.questions as Array<{ id: string }>;
  assert.deepEqual(
    questions.map((question) => question.id),
    [
      "operation",
      "click_target",
      "type_target",
      "offscreen_target",
      "goal_achieved",
      "observation_stale",
      "step_confidence",
    ],
  );
});

test("ping reports sdk version and never includes the key", () => {
  const config = loadConfig({
    TYPESAFE_API_KEY: "sk-test-should-not-leak",
    JEV_MODEL: "jev-latest",
  });
  const ping = handlePing(config);
  const serialized = JSON.stringify(ping);
  assert.equal(ping.api_key_set, true);
  assert.equal(ping.api_key_source, "env");
  assert.equal(ping.sdk_version, SDK_VERSION);
  assert.ok(typeof ping.packs === "number");
  assert.ok(!serialized.includes("sk-test-should-not-leak"));
});

test("run_pack refuses to call TypeSafe without a key", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "" });
  let called = false;
  await assert.rejects(
    () =>
      handleRunPack(
        { pack_id: "intent_router", state: { message: "hello" } },
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

test("run_pack validates state before calling TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  await assert.rejects(
    () =>
      handleRunPack(
        { pack_id: "pr_audit", state: { title: "nope" } },
        {
          config,
          systemOne: async () => {
            throw new Error("should not be called");
          },
        },
      ),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state",
  );
});

test("run_pack maps a pack onto systemOne with mocked TypeSafeClient", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key", JEV_MODEL: "jev-latest" });
  const pack = getPack("intent_router");
  const state = pack.example_state;

  const result = await handleRunPack(
    { pack_id: "intent_router", state },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.model, "jev-latest");
        assert.deepEqual(input.state, state);
        assert.equal(input.questions.intent?.type, "choice");
        assert.equal(input.questions.jailbreak?.type, "noul");
        assert.equal(input.questions.urgency?.type, "score");
        return {
          model: "jev-latest",
          answers: {
            intent: {
              type: "choice",
              choice: "action",
              confidence: 0.61,
              probabilities: { faq: 0.05, action: 0.7, handoff: 0.1, smalltalk: 0.05, other: 0.1 },
            },
            jailbreak: { type: "noul", noul: 0.93 },
            policy_violation: { type: "noul", noul: 0.12 },
            urgency: {
              type: "score",
              score: 1.4,
              confidence: 0.55,
              legend: { 0: "routine", 1: "soon", 2: "emergency" },
              probabilities: { 0: 0.1, 1: 0.6, 2: 0.3 },
            },
          },
          usage: { input_tokens: 120, output_tokens: 18 },
        } as SystemOneResult<Questions>;
      },
    },
  );

  assert.equal(result.pack_id, "intent_router");
  assert.equal(result.model, "jev-latest");
  assert.equal((result.answers as { jailbreak: { noul: number } }).jailbreak.noul, 0.93);
  assert.deepEqual(result.usage, { input_tokens: 120, output_tokens: 18 });
});
