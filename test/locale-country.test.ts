import assert from "node:assert/strict";
import { test } from "node:test";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import { loadConfig } from "../src/config.js";
import { ToolError } from "../src/errors.js";
import { handleDescribePack, handleRunPack } from "../src/handlers.js";
import { UNAVAILABLE_OPTION } from "../src/packs/catalog-choice.js";
import { getPack, questionsFor } from "../src/packs/index.js";
import { UNCLEAR_OPTION } from "../src/packs/locale-country.js";
import { validatePackState } from "../src/validate.js";

const PEDRO_FIVE = /argentina|uruguay|saudi|india|montevideo|canelones|hormig[oó]n/i;

test("locale_country describe_pack marks Choice options as built from state", () => {
  const described = handleDescribePack("locale_country");
  assert.equal(described.version, "2.0.0");
  assert.equal(described.dynamic_choice_from_state, true);
  const questions = described.questions as Array<{ id: string; type: string; criteria?: Record<string, unknown> }>;
  const country = questions.find((question) => question.id === "country");
  assert.equal(country?.type, "choice");
  assert.ok(country?.criteria?.[UNCLEAR_OPTION]);
  assert.ok(country?.criteria?.[UNAVAILABLE_OPTION]);
  assert.equal(country?.criteria?.argentina, undefined);
  assert.equal(country?.criteria?.usa, undefined);
});

test("locale_country builds Choice options from the caller countries catalog", () => {
  const pack = getPack("locale_country");
  assert.ok(pack.questionsForState);
  const questions = questionsFor(pack, pack.example_state);
  const country = questions.country;
  assert.equal(country?.type, "choice");
  if (country?.type !== "choice") {
    throw new Error("expected country choice");
  }
  assert.deepEqual(Object.keys(country.criteria).sort(), ["de", "jp", "unclear", "us"]);
  assert.ok(country.criteria[UNCLEAR_OPTION]);
  assert.equal(country.criteria[UNAVAILABLE_OPTION], undefined);
  assert.equal(country.criteria.argentina, undefined);
});

test("locale_country example_state is a neutral demo catalog", () => {
  const pack = getPack("locale_country");
  assert.deepEqual(pack.example_state.countries, ["us", "de", "jp"]);
  const blob = JSON.stringify({
    summary: pack.summary,
    when_to_use: pack.when_to_use,
    notes: pack.notes,
    questions: pack.questions,
    example_state: pack.example_state,
  });
  assert.doesNotMatch(blob, PEDRO_FIVE);
  assert.doesNotThrow(() => validatePackState(pack, pack.example_state));
});

test("locale_country requires countries and rejects a missing catalog", () => {
  const pack = getPack("locale_country");
  assert.throws(
    () => validatePackState(pack, { name: "Widget" }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /countries/.test(err.message),
  );
});

test("reserved and duplicate country ids are invalid_state", () => {
  const pack = getPack("locale_country");
  assert.ok(pack.questionsForState);
  assert.throws(
    () => pack.questionsForState?.({ name: "X", countries: ["unclear", "us"] }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /reserved/.test(err.message),
  );
  assert.throws(
    () => pack.questionsForState?.({ name: "X", countries: ["us", "us"] }),
    (err: unknown) => err instanceof ToolError && err.code === "invalid_state" && /duplicate/.test(err.message),
  );
});

test("run_pack locale_country sends catalog-built country options to systemOne", async () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "test-key", JEV_MODEL: "jev-latest" });
  const pack = getPack("locale_country");
  const state = {
    name: "Yen-denominated office stapler, Tokyo warehouse",
    countries: ["us", "de", "jp"],
  };

  const result = await handleRunPack(
    { pack_id: "locale_country", state },
    {
      config,
      systemOne: async (input) => {
        assert.deepEqual(input.state, state);
        const country = input.questions.country;
        assert.equal(country?.type, "choice");
        if (country?.type !== "choice") {
          throw new Error("expected country choice");
        }
        assert.ok(country.criteria.us);
        assert.ok(country.criteria.de);
        assert.ok(country.criteria.jp);
        assert.ok(country.criteria[UNCLEAR_OPTION]);
        assert.equal(country.criteria.argentina, undefined);
        return {
          model: "jev-latest",
          answers: {
            country: {
              type: "choice",
              choice: "jp",
              confidence: 0.8,
              probabilities: { us: 0.05, de: 0.1, jp: 0.8, unclear: 0.05 },
            },
            explicit_geo_cue: { type: "noul", noul: 0.9 },
            locale_signal: { type: "score", score: 3, confidence: 0.7, legend: [], probabilities: {} },
          },
          usage: { input_tokens: 1, output_tokens: 1 },
        } as SystemOneResult<Questions>;
      },
    },
  );

  assert.equal(result.pack_id, "locale_country");
  assert.equal(result.pack_version, pack.version);
  const answers = result.answers as { country: { choice: string } };
  assert.equal(answers.country.choice, "jp");
});
