import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { getPack, questionsFor } from "../src/packs/index.js";
import { NONE_OPTION } from "../src/packs/catalog-choice.js";
import { commandRiskGate, gateCodeAudit, gateI18nCopy, skillRouterGate, verifyGapCodeGate } from "../src/policy-examples.js";

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

  const cleanAudit = {
    wrong_layer: 0.1,
    blast_radius: 0.1,
    missing_verification: 0.1,
    secret_or_credential_risk: 0.05,
    inefficiency: 0.1,
    dead_or_premature_abstraction: 0.1,
    problem_severity: 0.4,
  };
  assert.equal(gateCodeAudit(cleanAudit), "ok");
  assert.equal(gateCodeAudit({ ...cleanAudit, missing_verification: 0.6, problem_severity: 1.6 }), "glance");
  assert.equal(gateCodeAudit({ ...cleanAudit, secret_or_credential_risk: 0.8 }), "deep_review");
  assert.equal(gateCodeAudit({ ...cleanAudit, problem_severity: 2.7 }), "deep_review");
  assert.equal(gateCodeAudit({ ...cleanAudit, blast_radius: 0.85 }), "deep_review");

  const covered = {
    has_adequate_verification: 0.82,
    claim_is_testable: 0.9,
    evidence_matches_claim: 0.78,
    verification_gap: 0.4,
    next_proof: "none_needed",
  };
  assert.equal(verifyGapCodeGate(covered), "ship");
  assert.equal(verifyGapCodeGate({ ...covered, verification_gap: 1.7, next_proof: "unit_test" }), "add_proof");
  assert.equal(
    verifyGapCodeGate({
      has_adequate_verification: 0.2,
      claim_is_testable: 0.8,
      evidence_matches_claim: 0.1,
      verification_gap: 1.2,
    }),
    "block",
  );
  assert.equal(verifyGapCodeGate({ ...covered, verification_gap: 2.6, next_proof: "unit_test" }), "block");
  assert.equal(
    verifyGapCodeGate({
      has_adequate_verification: 0.5,
      claim_is_testable: 0.7,
      evidence_matches_claim: 0.3,
      verification_gap: 1.0,
    }),
    "add_proof",
  );

  const cleanI18n = {
    has_user_facing_hardcoded_copy: 0.1,
    should_migrate_to_i18n: 0.1,
    already_partially_internationalized: 0.1,
    i18n_debt: 0.3,
  };
  assert.equal(gateI18nCopy(cleanI18n), "ok");
  assert.equal(gateI18nCopy({ ...cleanI18n, has_user_facing_hardcoded_copy: 0.6, i18n_debt: 1.6 }), "glance");
  assert.equal(gateI18nCopy({ ...cleanI18n, i18n_debt: 2.7 }), "block");
  assert.equal(
    gateI18nCopy({
      ...cleanI18n,
      has_user_facing_hardcoded_copy: 0.8,
      should_migrate_to_i18n: 0.75,
      i18n_debt: 2.0,
    }),
    "block",
  );
});
