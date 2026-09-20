import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(root, "scripts/smoke-all-packs.mjs");

function runSmoke(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
  });
}

test("smoke-all-packs.mjs runs every pack through mocked TypeSafe", () => {
  const dist = path.join(root, "dist", "index.js");
  if (!fs.existsSync(dist)) {
    const built = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
  }
  const result = runSmoke([], {
    ...process.env,
    MCP_JEV_CHECKOUT: root,
    TYPESAFE_API_KEY: "sk-must-not-be-used",
    CI: "",
    SMOKE_LIVE: "",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /smoke-all-packs: mocked/);
  assert.match(result.stdout, /pack\s+ok\s+ms\s+error/);
  const packIds = [
    "pr_audit",
    "intent_router",
    "locale_country",
    "computer_use_step",
    "model_router",
    "review_diff",
    "code_audit",
    "skill_router",
    "command_risk",
    "verify_gap",
    "boundary_check",
    "i18n_copy",
    "live_url_check",
  ];
  for (const id of packIds) {
    assert.match(result.stdout, new RegExp(`^${id}\\s+true\\s+`, "m"));
  }
  assert.match(result.stdout, new RegExp(`${packIds.length}/${packIds.length} ok`));
  assert.ok(!result.stdout.includes("sk-must-not-be-used"));
  assert.ok(!result.stderr.includes("sk-must-not-be-used"));
});

test("smoke-all-packs --live skips in CI without SMOKE_LIVE=1", () => {
  const result = runSmoke(["--live"], {
    ...process.env,
    MCP_JEV_CHECKOUT: root,
    CI: "true",
    SMOKE_LIVE: "",
    TYPESAFE_API_KEY: "sk-must-not-be-used",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /skip --live in CI/);
  assert.doesNotMatch(result.stdout, /\d+\/\d+ ok/);
  assert.ok(!result.stdout.includes("sk-must-not-be-used"));
});
