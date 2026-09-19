import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { loadConfig } from "../src/config.js";
import { handlePing } from "../src/handlers.js";
import { defaultUserConfigDir, parseDotEnv, readUserEnv, writeUserEnv } from "../src/user-config.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mcp-jev-config-"));
}

test("parseDotEnv ignores comments and blank lines", () => {
  const parsed = parseDotEnv("# hi\n\nTYPESAFE_API_KEY=abc\nJEV_MODEL='jev-latest'\n");
  assert.equal(parsed.TYPESAFE_API_KEY, "abc");
  assert.equal(parsed.JEV_MODEL, "jev-latest");
});

test("user store supplies the key when process env is empty", () => {
  const dir = tempDir();
  writeUserEnv({ TYPESAFE_API_KEY: "sk-from-store" }, dir);
  const config = loadConfig({ TYPESAFE_API_KEY: "" }, { userConfigDir: dir });
  assert.equal(config.apiKeySet, true);
  assert.equal(config.apiKey, "sk-from-store");
  assert.equal(config.apiKeySource, "user_store");
});

test("user store wins; process env is fallback only", () => {
  const dir = tempDir();
  writeUserEnv({ TYPESAFE_API_KEY: "sk-from-store" }, dir);
  const both = loadConfig({ TYPESAFE_API_KEY: "sk-from-env" }, { userConfigDir: dir });
  assert.equal(both.apiKey, "sk-from-store");
  assert.equal(both.apiKeySource, "user_store");

  const emptyStore = tempDir();
  const fallback = loadConfig({ TYPESAFE_API_KEY: "sk-from-env" }, { userConfigDir: emptyStore });
  assert.equal(fallback.apiKey, "sk-from-env");
  assert.equal(fallback.apiKeySource, "env");
});

test("MCP_JEV_HOME overrides the ~/.mcp_jev config directory", () => {
  assert.equal(defaultUserConfigDir({ MCP_JEV_HOME: "/tmp/custom-mcp-jev" }), "/tmp/custom-mcp-jev");
  assert.equal(defaultUserConfigDir({ MCP_JEV_CONFIG: "/tmp/alias" }), "/tmp/alias");
  assert.equal(
    defaultUserConfigDir({ MCP_JEV_HOME: "/tmp/home-wins", MCP_JEV_CONFIG: "/tmp/alias" }),
    "/tmp/home-wins",
  );
});

test("custom env without userConfigDir does not read the real home store", () => {
  const config = loadConfig({ TYPESAFE_API_KEY: "" });
  assert.equal(config.apiKeySet, false);
  assert.equal(config.apiKeySource, "none");
});

test("writeUserEnv is 0600 on POSIX and merge-safe", () => {
  const dir = tempDir();
  writeUserEnv({ TYPESAFE_API_KEY: "first", JEV_MODEL: "jev-latest" }, dir);
  writeUserEnv({ TYPESAFE_API_KEY: "second" }, dir);
  const stored = readUserEnv(dir);
  assert.equal(stored.TYPESAFE_API_KEY, "second");
  assert.equal(stored.JEV_MODEL, "jev-latest");
  if (process.platform !== "win32") {
    const mode = fs.statSync(path.join(dir, ".env")).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});

test("ping reports store key as set and never echoes it", () => {
  const dir = tempDir();
  writeUserEnv({ TYPESAFE_API_KEY: "sk-must-not-leak" }, dir);
  const config = loadConfig({}, { userConfigDir: dir });
  const ping = handlePing(config);
  const serialized = JSON.stringify(ping);
  assert.equal(ping.api_key_set, true);
  assert.equal(ping.api_key_source, "user_store");
  assert.equal(ping.user_config_dir, dir);
  assert.ok(!serialized.includes("sk-must-not-leak"));
});
