import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("install.sh non-interactive without a key writes NOT_READY and exits non-zero", () => {
  const configDir = tempDir("mcp-jev-install-");
  const result = spawnSync("bash", [path.join(root, "scripts/install.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: configDir,
      MCP_JEV_HOME: configDir,
      MCP_JEV_CHECKOUT: root,
      MCP_JEV_INSTALL_SKIP_GIT: "1",
      MCP_JEV_INSTALL_SKIP_BUILD: "1",
      TYPESAFE_API_KEY: "",
    },
  });
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /NOT_READY/);
  assert.ok(fs.existsSync(path.join(configDir, "NOT_READY")));
  assert.ok(fs.existsSync(path.join(configDir, "bin", "mcp_jev")));
  const marker = fs.readFileSync(path.join(configDir, "NOT_READY"), "utf8");
  assert.ok(!/sk-[A-Za-z0-9]{8,}/.test(marker));
  assert.match(marker, /config set-key/);
});

test("install.sh with a key clears NOT_READY and does not print the secret", () => {
  const configDir = tempDir("mcp-jev-install-key-");
  const dist = path.join(root, "dist", "index.js");
  if (!fs.existsSync(dist)) {
    const built = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
    assert.equal(built.status, 0, built.stderr);
  }
  const result = spawnSync("bash", [path.join(root, "scripts/install.sh")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: configDir,
      MCP_JEV_HOME: configDir,
      MCP_JEV_CHECKOUT: root,
      MCP_JEV_INSTALL_SKIP_GIT: "1",
      MCP_JEV_INSTALL_SKIP_BUILD: "1",
      TYPESAFE_API_KEY: "sk-install-secret",
    },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(!result.stdout.includes("sk-install-secret"));
  assert.ok(!result.stderr.includes("sk-install-secret"));
  assert.equal(fs.existsSync(path.join(configDir, "NOT_READY")), false);
  const stored = fs.readFileSync(path.join(configDir, ".env"), "utf8");
  assert.match(stored, /TYPESAFE_API_KEY=sk-install-secret/);
});
