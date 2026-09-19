import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { SMOKE_TOOLS } from "../src/smoke.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function runConfig(args: string[], extraEnv: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TYPESAFE_API_KEY: "", ...extraEnv },
  });
}

test("config set-key writes the store and status never prints the key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-jev-cli-"));
  const set = runConfig(["config", "set-key", "sk-cli-secret"], { MCP_JEV_CONFIG: dir });
  assert.equal(set.status, 0, set.stderr);
  assert.ok(!set.stdout.includes("sk-cli-secret"));
  assert.ok(fs.existsSync(path.join(dir, ".env")));

  const status = runConfig(["config", "status"], { MCP_JEV_CONFIG: dir });
  assert.equal(status.status, 0, status.stderr);
  const body = JSON.parse(status.stdout) as { api_key_set: boolean; api_key_source: string };
  assert.equal(body.api_key_set, true);
  assert.ok(!status.stdout.includes("sk-cli-secret"));
});

test("config path prints the override directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-jev-path-"));
  const result = runConfig(["config", "path"], { MCP_JEV_CONFIG: dir });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), dir);
});

test("help lists doctor, scan, smoke, and help", () => {
  const result = runConfig(["help"], {});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /mcp_jev doctor/);
  assert.match(result.stdout, /mcp_jev scan/);
  assert.match(result.stdout, /mcp_jev smoke/);
  assert.match(result.stdout, /mcp_jev help/);
});

test("smoke CLI via index.ts prints ok and does not call TypeSafe", () => {
  const result = runConfig(["smoke"], { TYPESAFE_API_KEY: "sk-must-not-be-used" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /mcp_jev smoke: ok/);
  assert.match(result.stdout, new RegExp(`tools: ${SMOKE_TOOLS.join(", ")}`));
  assert.match(result.stdout, /code_audit/);
  assert.ok(!result.stdout.includes("sk-must-not-be-used"));
  assert.ok(!result.stderr.includes("sk-must-not-be-used"));
});

test("smoke runs initialize, tools/list, ping, list_packs without TypeSafe", async () => {
  const { runSmoke, formatSmokeResult } = await import("../src/smoke.js");
  const result = await runSmoke({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: root,
  });
  assert.equal(result.ok, true);
  assert.equal(result.server, "mcp_jev");
  assert.deepEqual(result.tools, [...SMOKE_TOOLS]);
  assert.ok(result.packs.includes("code_audit"));
  assert.ok(result.packs.includes("review_diff"));
  const text = formatSmokeResult(result);
  assert.match(text, /mcp_jev smoke: ok/);
  assert.ok(!text.includes("TYPESAFE_API_KEY"));
});
