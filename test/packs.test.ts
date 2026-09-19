import assert from "node:assert/strict";
import { test } from "node:test";

import { allPacks, getPack, listPacks, packCount, questionsFor } from "../src/packs/index.js";
import { validatePackState } from "../src/validate.js";

test("pack registry loads the starter packs", () => {
  const ids = listPacks().map((pack) => pack.id).sort();
  assert.deepEqual(ids, [
    "command_risk",
    "computer_use_step",
    "intent_router",
    "locale_country",
    "model_router",
    "pr_audit",
    "review_diff",
    "skill_router",
  ]);
  assert.equal(packCount(), 8);
});

test("each pack has versioned metadata, schema, example, and questions", () => {
  for (const pack of allPacks()) {
    assert.match(pack.version, /^\d+\.\d+\.\d+$/);
    assert.ok(pack.title);
    assert.ok(pack.summary);
    assert.ok(pack.when_to_use);
    assert.equal(pack.state_schema.type, "object");
    assert.ok(pack.state_schema.properties);
    assert.ok(pack.questions.length >= 2);
    assert.ok(pack.suggested_workflow.length >= 3);
    assert.ok(pack.example_state && typeof pack.example_state === "object");

    const ids = pack.questions.map((question) => question.id);
    assert.equal(new Set(ids).size, ids.length, `${pack.id} has duplicate question ids`);

    for (const question of pack.questions) {
      assert.ok(question.instructions.includes("`") || question.instructions.length > 20);
      if (question.type === "choice") {
        assert.ok(Object.keys(question.criteria).length >= 2);
      }
      if (question.type === "score") {
        assert.ok(question.criteria.length >= 2);
      }
    }

    const sdkQuestions = questionsFor(pack, pack.example_state);
    assert.deepEqual(Object.keys(sdkQuestions).sort(), ids.sort());
    for (const question of pack.questions) {
      assert.equal(sdkQuestions[question.id]?.type, question.type);
    }

    assert.doesNotThrow(() => validatePackState(pack, pack.example_state));
  }
});

test("pr_audit documents that code_gate is caller-owned", () => {
  const pack = getPack("pr_audit");
  const questionIds = pack.questions.map((question) => question.id);
  assert.deepEqual(questionIds, [
    "merge_risk",
    "money",
    "hours",
    "hours_money_boundary",
    "migration",
    "blast_radius",
  ]);
  assert.ok(!questionIds.includes("code_gate"));
  assert.ok(pack.notes.some((note) => note.includes("code_gate is computed by the caller")));
  assert.ok(pack.summary.includes("Staged review"));
  assert.ok(pack.when_to_use.includes("staged review"));
});

test("unknown pack_id is a clear error", () => {
  assert.throws(() => getPack("ask_jev"), /Unknown pack_id "ask_jev"/);
});
