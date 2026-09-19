import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import {
  catalogChoiceCriteria,
  MAX_CHOICE_OPTIONS,
  NONE_OPTION,
  UNAVAILABLE_OPTION,
} from "../src/packs/catalog-choice.js";
import { getPack, questionsFor } from "../src/packs/index.js";

test("computer_use_step builds Choice options from item ids", () => {
  const pack = getPack("computer_use_step");
  const questions = questionsFor(pack, pack.example_state);
  const click = questions.click_target;
  assert.equal(click?.type, "choice");
  if (click?.type !== "choice") {
    throw new Error("expected click_target choice");
  }
  assert.ok(click.criteria[NONE_OPTION]);
  assert.ok(click.criteria.email);
  assert.ok(click.criteria.sign_in);
  assert.equal(click.criteria.unavailable, undefined);

  const offscreen = questions.offscreen_target;
  assert.equal(offscreen?.type, "choice");
  if (offscreen?.type !== "choice") {
    throw new Error("expected offscreen_target choice");
  }
  assert.ok(offscreen.criteria.privacy);
  assert.ok(String(offscreen.criteria.privacy).includes("role=link"));
});

test("empty item catalog uses none + unavailable so Choice stays valid", () => {
  const criteria = catalogChoiceCriteria([], "Do not click.", "items");
  assert.deepEqual(Object.keys(criteria).sort(), [NONE_OPTION, UNAVAILABLE_OPTION].sort());
});

test("reserved and duplicate item ids are invalid_state", () => {
  assert.throws(
    () =>
      catalogChoiceCriteria(
        [{ id: "none", role: "button", label: "Nope" }],
        "Do not click.",
        "items",
      ),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /reserved/.test(err.message),
  );
  assert.throws(
    () =>
      catalogChoiceCriteria(
        [
          { id: "a", role: "button", label: "One" },
          { id: "a", role: "button", label: "Two" },
        ],
        "Do not click.",
        "items",
      ),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /duplicate/.test(err.message),
  );
});

test("catalog larger than the TypeSafe Choice cap is invalid_state", () => {
  const items = Array.from({ length: MAX_CHOICE_OPTIONS }, (_, index) => ({
    id: `item_${index}`,
    role: "button",
    label: `Item ${index}`,
  }));
  assert.throws(
    () => catalogChoiceCriteria(items, "Do not click.", "items"),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /at most/.test(err.message),
  );
});

test("run_pack sends materialized target ids to the mocked TypeSafe client", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key", JEV_MODEL: "jev-latest" });
  const pack = getPack("computer_use_step");
  const state = pack.example_state;

  const result = await handleRunPack(
    { pack_id: "computer_use_step", state },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.questions.operation?.type, "choice");
        const click = input.questions.click_target;
        assert.equal(click?.type, "choice");
        if (click?.type !== "choice") {
          throw new Error("expected click_target");
        }
        assert.deepEqual(
          Object.keys(click.criteria).sort(),
          ["email", "forgot", NONE_OPTION, "password", "sign_in"].sort(),
        );
        return {
          model: "jev-latest",
          answers: {
            operation: {
              type: "choice",
              choice: "type_email",
              confidence: 0.72,
              probabilities: { type_email: 0.72, click_item: 0.1, done: 0.05 },
            },
            click_target: { type: "choice", choice: "none", confidence: 0.8, probabilities: { none: 0.8 } },
            type_target: { type: "choice", choice: "email", confidence: 0.81, probabilities: { email: 0.81 } },
            offscreen_target: { type: "choice", choice: "none", confidence: 0.9, probabilities: { none: 0.9 } },
            goal_achieved: { type: "noul", noul: 0.08 },
            observation_stale: { type: "noul", noul: 0.11 },
            step_confidence: {
              type: "score",
              score: 2.1,
              confidence: 0.6,
              legend: { 0: "no", 1: "weak", 2: "ok", 3: "strong" },
              probabilities: { 2: 0.7 },
            },
          },
          usage: { input_tokens: 80, output_tokens: 12 },
        } as SystemOneResult<Questions>;
      },
    },
  );

  assert.equal(result.pack_id, "computer_use_step");
  assert.equal((result.answers as { operation: { choice: string } }).operation.choice, "type_email");
});

test("run_pack rejects reserved item ids before calling TypeSafe", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const pack = getPack("computer_use_step");
  let called = false;
  await assert.rejects(
    () =>
      handleRunPack(
        {
          pack_id: "computer_use_step",
          state: {
            ...pack.example_state,
            items: [{ id: "unavailable", role: "button", label: "Bad" }],
          },
        },
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

test("model_router example state runs through the mocked client", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key" });
  const pack = getPack("model_router");
  const described = handleDescribePack("model_router");
  assert.equal(described.dynamic_choice_from_state, false);
  assert.ok(String(described.notes).includes("Thresholds live in caller code"));

  await handleRunPack(
    { pack_id: "model_router", state: pack.example_state },
    {
      config,
      systemOne: async (input) => {
        assert.equal(input.questions.route?.type, "choice");
        assert.equal(input.questions.needs_code_edit?.type, "noul");
        assert.equal(input.questions.difficulty?.type, "score");
        return {
          model: "jev-latest",
          answers: {
            route: { type: "choice", choice: "fast_local", confidence: 0.7, probabilities: { fast_local: 0.7 } },
            needs_code_edit: { type: "noul", noul: 0.8 },
            needs_browser: { type: "noul", noul: 0.05 },
            unsafe_or_irreversible: { type: "noul", noul: 0.02 },
            simple_lookup: { type: "noul", noul: 0.1 },
            difficulty: {
              type: "score",
              score: 1.2,
              confidence: 0.6,
              legend: { 0: "trivial", 1: "routine", 2: "multi", 3: "hard" },
              probabilities: { 1: 0.7 },
            },
          },
          usage: { input_tokens: 40, output_tokens: 8 },
        } as SystemOneResult<Questions>;
      },
    },
  );
});

test("docs and scripts have no personal Desktop paths", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const roots = ["README.md", "CONTRIBUTING.md", "docs", "skills", "scripts", "src"];
  const forbidden = [/\/Users\/pedroknigge/, /Pedro(?:['’]s)? Desktop/i, /Desktop\/mcp_jev/];
  const hits: string[] = [];

  async function walk(rel: string): Promise<void> {
    const abs = join(process.cwd(), rel);
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      const text = await readFile(abs, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(text)) {
          hits.push(`${rel} matches ${pattern}`);
        }
      }
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      await walk(join(rel, entry.name));
    }
  }

  for (const root of roots) {
    await walk(root);
  }
  assert.deepEqual(hits, []);
});
