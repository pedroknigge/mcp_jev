import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { getPack } from "../src/packs/index.js";

test("verify_gap describe stays internally consistent and code_gate is caller-owned", () => {
  const pack = getPack("verify_gap");
  const described = handleDescribePack("verify_gap");
  assert.equal(described.id, "verify_gap");
  assert.equal(described.dynamic_choice_from_state, false);
  assert.deepEqual(
    pack.questions.map((question) => question.id),
    [
      "has_adequate_verification",
      "claim_is_testable",
      "evidence_matches_claim",
      "verification_gap",
      "next_proof",
    ],
  );
  const nextProof = pack.questions.find((question) => question.id === "next_proof");
  assert.equal(nextProof?.type, "choice");
  if (nextProof?.type === "choice") {
    assert.deepEqual(Object.keys(nextProof.criteria).sort(), [
      "integration",
      "manual_check",
      "none_needed",
      "type_proof",
      "unclear",
      "unit_test",
    ]);
  }
  assert.ok(!pack.questions.some((question) => question.id === "code_gate"));
  assert.ok(pack.notes.some((note) => note.includes("code_gate is computed by the caller")));
  assert.doesNotMatch(JSON.stringify(pack.example_state), /Amarilla|plata\/horas|\/Users\/|Desktop\//i);
});

test("verify_gap run_pack uses mocked TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const pack = getPack("verify_gap");
  const result = await handleRunPack(
    { pack_id: "verify_gap", state: pack.example_state },
    {
      config,
      systemOne: async (input) => {
        assert.deepEqual(input.state, pack.example_state);
        assert.equal(input.questions.has_adequate_verification?.type, "noul");
        assert.equal(input.questions.claim_is_testable?.type, "noul");
        assert.equal(input.questions.evidence_matches_claim?.type, "noul");
        assert.equal(input.questions.verification_gap?.type, "score");
        assert.equal(input.questions.next_proof?.type, "choice");
        return {
          model: "jev-latest",
          answers: {
            has_adequate_verification: { type: "noul", noul: 0.82 },
            claim_is_testable: { type: "noul", noul: 0.9 },
            evidence_matches_claim: { type: "noul", noul: 0.78 },
            verification_gap: {
              type: "score",
              score: 0.4,
              confidence: 0.7,
              legend: { 0: "none", 1: "small", 2: "material", 3: "block" },
              probabilities: { 0: 0.8 },
            },
            next_proof: {
              type: "choice",
              choice: "none_needed",
              confidence: 0.72,
              probabilities: { none_needed: 0.72, unit_test: 0.2 },
            },
          },
          usage: { input_tokens: 20, output_tokens: 6 },
        } as SystemOneResult<Questions>;
      },
    },
  );
  assert.equal(result.pack_id, "verify_gap");
  assert.equal((result.answers as { next_proof: { choice: string } }).next_proof.choice, "none_needed");
});

test("verify_gap rejects missing claim before TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  let called = false;
  await assert.rejects(
    () =>
      handleRunPack(
        { pack_id: "verify_gap", state: { evidence: ["npm test"] } },
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
