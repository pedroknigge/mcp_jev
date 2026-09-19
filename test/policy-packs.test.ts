import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { getPack, questionsFor } from "../src/packs/index.js";
import { NONE_OPTION } from "../src/packs/catalog-choice.js";
import { commandRiskGate, skillRouterGate } from "../src/policy-examples.js";

test("skill_router builds skill Choice from available_skills[]", () => {
  const pack = getPack("skill_router");
  const described = handleDescribePack("skill_router");
  assert.equal(described.dynamic_choice_from_state, true);
  const questions = questionsFor(pack, pack.example_state);
  const skill = questions.skill;
  assert.equal(skill?.type, "choice");
  if (skill?.type !== "choice") {
    throw new Error("expected skill choice");
  }
  assert.ok(skill.criteria[NONE_OPTION]);
  assert.ok(skill.criteria.mcp_jev);
  assert.ok(skill.criteria["typesafe-ai"]);
});

test("skill_router and command_risk run through mocked TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });

  await handleRunPack(
    { pack_id: "skill_router", state: getPack("skill_router").example_state },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.questions.needs_skill?.type, "noul");
        assert.equal(input.questions.change_risk?.type, "score");
        return {
          model: "jev-latest",
          answers: {
            needs_skill: { type: "noul", noul: 0.8 },
            skill: { type: "choice", choice: "mcp_jev", confidence: 0.7, probabilities: { mcp_jev: 0.7 } },
            change_risk: {
              type: "score",
              score: 1.2,
              confidence: 0.6,
              legend: { 0: "ro", 1: "local", 2: "cross", 3: "high" },
              probabilities: { 1: 0.7 },
            },
          },
          usage: { input_tokens: 10, output_tokens: 4 },
        } as SystemOneResult<Questions>;
      },
    },
  );

  const risk = getPack("command_risk");
  assert.ok(risk.notes.some((note) => /allowlist|sandbox/i.test(note)));
  await handleRunPack(
    { pack_id: "command_risk", state: risk.example_state },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.questions.is_destructive?.type, "noul");
        assert.equal(input.questions.touches_credentials?.type, "noul");
        assert.equal(input.questions.scope_matches?.type, "noul");
        assert.equal(input.questions.severity?.type, "score");
        return {
          model: "jev-latest",
          answers: {
            is_destructive: { type: "noul", noul: 0.05 },
            touches_credentials: { type: "noul", noul: 0.02 },
            scope_matches: { type: "noul", noul: 0.9 },
            severity: {
              type: "score",
              score: 0.4,
              confidence: 0.7,
              legend: { 0: "safe", 1: "local", 2: "wide", 3: "danger" },
              probabilities: { 0: 0.8 },
            },
          },
          usage: { input_tokens: 8, output_tokens: 3 },
        } as SystemOneResult<Questions>;
      },
    },
  );
});

test("code-owned policy gates are unit-testable without TypeSafe", () => {
  assert.equal(
    commandRiskGate({ is_destructive: 0.1, touches_credentials: 0.1, scope_matches: 0.9, severity: 0.4 }),
    "allow",
  );
  assert.equal(
    commandRiskGate({ is_destructive: 0.8, touches_credentials: 0.1, scope_matches: 0.9, severity: 0.4 }),
    "refuse",
  );
  assert.equal(
    commandRiskGate({ is_destructive: 0.1, touches_credentials: 0.1, scope_matches: 0.2, severity: 0.4 }),
    "refuse",
  );
  assert.equal(skillRouterGate({ needs_skill: 0.8, skill: "mcp_jev", change_risk: 1.2 }), "load");
  assert.equal(skillRouterGate({ needs_skill: 0.8, skill: "mcp_jev", change_risk: 2.8 }), "ask");
  assert.equal(skillRouterGate({ needs_skill: 0.2, skill: "mcp_jev", change_risk: 1.0 }), "skip");
});
