import assert from "node:assert/strict";
import { test } from "node:test";

import { loadConfig } from "../src/config.js";

test("JEV_MODEL wins over TYPESAFE_DEFAULT_MODEL", () => {
  const config = loadConfig({
    JEV_MODEL: "jev-custom",
    TYPESAFE_DEFAULT_MODEL: "jev-other",
  });
  assert.equal(config.model, "jev-custom");
  assert.equal(config.apiKeySet, false);
});

test("whitespace-only API key is treated as missing", () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "   " });
  assert.equal(config.apiKeySet, false);
  assert.equal(config.apiKey, undefined);
});
