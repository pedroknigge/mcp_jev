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
  assert.match(result.stdout, /npx skills add pedroknigge\/mcp_jev --skill mcp_jev/);
  assert.match(result.stdout, /SKILL REFRESH/);
  assert.match(result.stdout, /one path only/);
  assert.match(result.stdout, /Skill refreshed once/);
  assert.doesNotMatch(result.stdout, /cp -R /);
  assert.doesNotMatch(result.stdout, /MCP_JEV_SYNC_SKILL/);
  const skillDest = path.join(configDir, ".agents", "skills", "mcp_jev");
  assert.ok(fs.existsSync(path.join(skillDest, "SKILL.md")), result.stdout + result.stderr);
  assert.equal(fs.existsSync(path.join(skillDest, "mcp_jev")), false);
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

test("update.sh refreshes skill once and does not offer a second copy path", () => {
  const script = fs.readFileSync(path.join(root, "scripts/update.sh"), "utf8");
  assert.match(script, /SKILL REFRESH/);
  assert.match(script, /refresh-skill\.sh/);
  assert.match(script, /npx skills add pedroknigge\/mcp_jev --skill mcp_jev/);
  assert.match(script, /one path only/);
  assert.match(script, /VERSION —/);
  assert.doesNotMatch(script, /MCP_JEV_SYNC_SKILL/);
  assert.doesNotMatch(script, /cp -R "\$REPO_HOME\/skills\/mcp_jev"/);
});

test("install.sh refreshes skill once into ~/.agents/skills/mcp_jev and does not nest", () => {
  const home = tempDir("mcp-jev-skill-once-");
  const dest = path.join(home, ".agents", "skills", "mcp_jev");
  fs.mkdirSync(path.join(dest, "mcp_jev"), { recursive: true });
  fs.writeFileSync(path.join(dest, "mcp_jev", "SKILL.md"), "stale nest\n");
  const env = {
    ...process.env,
    HOME: home,
    MCP_JEV_HOME: path.join(home, ".mcp_jev"),
    MCP_JEV_CHECKOUT: root,
    MCP_JEV_INSTALL_SKIP_GIT: "1",
    MCP_JEV_INSTALL_SKIP_BUILD: "1",
    TYPESAFE_API_KEY: "",
  };
  const first = spawnSync("bash", [path.join(root, "scripts/install.sh")], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  assert.notEqual(first.status, 0, first.stdout + first.stderr);
  assert.ok(fs.existsSync(path.join(dest, "SKILL.md")), first.stdout + first.stderr);
  assert.equal(fs.existsSync(path.join(dest, "mcp_jev")), false, "must replace leftover nest");
  assert.match(first.stdout, /Skill refreshed once/);
  assert.doesNotMatch(first.stdout, /cp -R /);

  const second = spawnSync("bash", [path.join(root, "scripts/install.sh")], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  assert.notEqual(second.status, 0, second.stdout + second.stderr);
  assert.ok(fs.existsSync(path.join(dest, "SKILL.md")));
  assert.equal(fs.existsSync(path.join(dest, "mcp_jev")), false, "second refresh must not nest");
});

test("refresh-skill.sh refuses to copy into the in-repo skill source", () => {
  const result = spawnSync(
    "bash",
    [path.join(root, "scripts/refresh-skill.sh"), root],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        MCP_JEV_SKILL_HOME: path.join(root, "skills", "mcp_jev", "mcp_jev"),
      },
    },
  );
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(`${result.stdout}${result.stderr}`, /refusing to copy|nests mcp_jev\/mcp_jev/);
  assert.equal(fs.existsSync(path.join(root, "skills", "mcp_jev", "mcp_jev")), false);
});
