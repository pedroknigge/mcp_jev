import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { parseCustomRunInput } from "../src/custom-questions.js";
import { handleRunQuestions } from "../src/handlers.js";
import { BLIND_I18N_BODY } from "../scripts/blind-i18n-example.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(root, "scripts/blind-i18n-example.mjs");

function runScript(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
  });
}

test("blind i18n body is valid run_questions input and is not an exact i18n_copy match", () => {
  const parsed = parseCustomRunInput(BLIND_I18N_BODY);
  assert.equal(parsed.questions.length, 5);
  assert.deepEqual(
    parsed.questions.map((question) => question.id),
    [
      "has_user_facing_hardcoded_copy",
      "should_migrate_to_i18n",
      "i18n_debt",
      "hottest_candidate",
      "needs_locale_split",
    ],
  );
  assert.equal(
    parsed.questions.some((question) => question.id === "already_partially_internationalized"),
    false,
  );
  assert.equal(
    parsed.questions.some((question) => question.id === "primary_bucket"),
    false,
  );
  const hottest = parsed.questions.find((question) => question.id === "hottest_candidate");
  assert.equal(hottest?.type, "choice");
  if (hottest?.type !== "choice") {
    throw new Error("expected hottest_candidate choice");
  }
  assert.deepEqual(Object.keys(hottest.criteria).sort(), [
    "load_error",
    "login_heading",
    "none",
    "submit_btn",
  ]);
});

test("handleRunQuestions maps the blind i18n body onto mocked systemOne", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key", JEV_MODEL: "jev-latest" });
  const result = await handleRunQuestions(BLIND_I18N_BODY, {
    config,
    systemOne: async (input) => {
      assert.equal(input.model, "jev-latest");
      assert.deepEqual(input.state, BLIND_I18N_BODY.state);
      assert.equal(input.questions.has_user_facing_hardcoded_copy?.type, "noul");
      assert.equal(input.questions.needs_locale_split?.type, "noul");
      assert.equal(input.questions.i18n_debt?.type, "score");
      assert.equal(input.questions.hottest_candidate?.type, "choice");
      return {
        model: "jev-latest",
        answers: {
          has_user_facing_hardcoded_copy: { type: "noul", noul: 0.88 },
          should_migrate_to_i18n: { type: "noul", noul: 0.8 },
          i18n_debt: {
            type: "score",
            score: 2,
            confidence: 0.6,
            legend: { 0: "clean", 1: "leftover", 2: "cross", 3: "blocking" },
            probabilities: { 2: 0.6 },
          },
          hottest_candidate: {
            type: "choice",
            choice: "login_heading",
            confidence: 0.7,
            probabilities: { login_heading: 0.7 },
          },
          needs_locale_split: { type: "noul", noul: 0.74 },
        },
        usage: { input_tokens: 40, output_tokens: 8 },
      } as SystemOneResult<Questions>;
    },
  });

  assert.equal(result.pack_id, undefined);
  assert.equal((result.answers as { hottest_candidate: { choice: string } }).hottest_candidate.choice, "login_heading");
  assert.equal(
    (result.answers as { needs_locale_split: { noul: number } }).needs_locale_split.noul,
    0.74,
  );
});

test("blind-i18n-example.mjs runs mocked systemOne without a live key", () => {
  const result = runScript([], {
    ...process.env,
    MCP_JEV_CHECKOUT: root,
    TYPESAFE_API_KEY: "sk-must-not-be-used",
    CI: "",
    SMOKE_LIVE: "",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /blind-i18n-example: mocked/);
  assert.match(result.stdout, /tool=run_questions/);
  assert.match(result.stdout, /pack_id=none/);
  assert.match(result.stdout, /needs_locale_split/);
  assert.match(result.stdout, /hottest_candidate/);
  assert.ok(!result.stdout.includes("sk-must-not-be-used"));
  assert.ok(!result.stderr.includes("sk-must-not-be-used"));
});

test("skill, README, and CUSTOM_JUDGMENTS keep the same i18n run_questions heads as the script", () => {
  const corpus = [
    "skills/mcp_jev/SKILL.md",
    "README.md",
    "docs/CUSTOM_JUDGMENTS.md",
    "docs/DOGFOOD.md",
  ]
    .map((rel) => fs.readFileSync(path.join(root, rel), "utf8"))
    .join("\n");
  for (const id of BLIND_I18N_BODY.questions.map((question) => question.id)) {
    assert.ok(corpus.includes(id), `docs missing run_questions i18n head ${id}`);
  }
  assert.match(corpus, /login_heading/);
  assert.match(corpus, /needs_locale_split/);
});

test("blind-i18n-example --live skips in CI without SMOKE_LIVE=1", () => {
  const result = runScript(["--live"], {
    ...process.env,
    MCP_JEV_CHECKOUT: root,
    CI: "true",
    SMOKE_LIVE: "",
    TYPESAFE_API_KEY: "sk-must-not-be-used",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /skip --live in CI/);
  assert.doesNotMatch(result.stdout, /tool=run_questions/);
  assert.ok(!result.stdout.includes("sk-must-not-be-used"));
});
