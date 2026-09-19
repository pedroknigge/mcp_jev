import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("verify-mcp.sh smokes initialize, tools/list, ping, and list_packs", () => {
  const dist = path.join(root, "dist", "index.js");
  if (!fs.existsSync(dist)) {
    const built = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
  }
  const result = spawnSync("bash", [path.join(root, "scripts/verify-mcp.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      MCP_JEV_CHECKOUT: root,
      TYPESAFE_API_KEY: "sk-must-not-be-used",
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /verify-mcp: ok/);
  assert.match(result.stdout, /initialize:/);
  assert.match(result.stdout, /tools\/list: describe_pack, list_packs, ping, run_pack/);
  assert.match(result.stdout, /list_packs: /);
  assert.match(result.stdout, /computer_use_step/);
  assert.match(result.stdout, /review_diff/);
  assert.match(result.stdout, /code_audit/);
  assert.match(result.stdout, /skill_router/);
  assert.match(result.stdout, /command_risk/);
  assert.ok(!result.stdout.includes("sk-must-not-be-used"));
});
