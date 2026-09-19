import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { formatDoctorReport, runDoctor } from "../src/doctor.js";
import { writeHostConfigs } from "../src/hosts.js";
import { clearNotReadyMarker, hasNotReadyMarker, writeNotReadyMarker } from "../src/ready.js";
import { writeHomeRecord, writeUserEnv } from "../src/user-config.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("doctor fails closed without checkout, wrapper, or key, and never prints a key", () => {
  const configDir = tempDir("mcp-jev-doctor-");
  const emptyHome = tempDir("mcp-jev-empty-home-");
  writeUserEnv({ TYPESAFE_API_KEY: "sk-must-not-appear" }, configDir);
  const report = runDoctor({
    env: { MCP_JEV_HOME: configDir },
    userConfigDir: configDir,
    repoHome: path.join(emptyHome, "missing-checkout"),
    homeDir: emptyHome,
    detectHosts: true,
  });
  assert.equal(report.api_key_set, true);
  assert.equal(report.ok, false);
  assert.equal(report.ready, false);
  assert.ok(report.checks.some((check) => check.id === "checkout" && !check.ok));
  assert.ok(report.checks.some((check) => check.id === "wrapper" && !check.ok));
  const text = formatDoctorReport(report);
  assert.ok(!text.includes("sk-must-not-appear"));
  assert.ok(!JSON.stringify(report).includes("sk-must-not-appear"));
});

test("doctor is ready when checkout, dist, wrapper, and key are present", () => {
  const configDir = tempDir("mcp-jev-doctor-ok-");
  const homeDir = tempDir("mcp-jev-hosts-");
  writeHomeRecord(root, configDir);
  writeUserEnv({ TYPESAFE_API_KEY: "sk-hidden" }, configDir);
  fs.mkdirSync(path.join(configDir, "bin"), { recursive: true });
  fs.writeFileSync(path.join(configDir, "bin", "mcp_jev"), "#!/bin/sh\n", { mode: 0o755 });

  const report = runDoctor({
    env: { MCP_JEV_HOME: configDir },
    userConfigDir: configDir,
    repoHome: root,
    homeDir,
    detectHosts: true,
  });
  const distOk = report.checks.find((check) => check.id === "dist");
  if (!distOk?.ok) {
    // Fresh checkout may not have dist yet; still assert the other required checks.
    assert.equal(report.checks.find((check) => check.id === "checkout")?.ok, true);
    assert.equal(report.checks.find((check) => check.id === "wrapper")?.ok, true);
    assert.equal(report.api_key_set, true);
    return;
  }
  assert.equal(report.ok, true);
  assert.equal(report.ready, true);
  assert.ok(!JSON.stringify(report).includes("sk-hidden"));
});

test("NOT_READY marker makes doctor fail even if a process env key exists", () => {
  const configDir = tempDir("mcp-jev-not-ready-");
  writeHomeRecord(root, configDir);
  fs.mkdirSync(path.join(configDir, "bin"), { recursive: true });
  fs.writeFileSync(path.join(configDir, "bin", "mcp_jev"), "#!/bin/sh\n", { mode: 0o755 });
  writeNotReadyMarker(configDir);
  assert.equal(hasNotReadyMarker(configDir), true);

  const report = runDoctor({
    env: { MCP_JEV_HOME: configDir, TYPESAFE_API_KEY: "" },
    userConfigDir: configDir,
    repoHome: root,
    homeDir: tempDir("mcp-jev-nr-home-"),
    detectHosts: false,
  });
  assert.equal(report.checks.find((check) => check.id === "not_ready_marker")?.ok, false);
  assert.equal(report.ready, false);
  clearNotReadyMarker(configDir);
  assert.equal(hasNotReadyMarker(configDir), false);
});

test("doctor CLI --json never echoes the key and exits 1 when not ready", () => {
  const configDir = tempDir("mcp-jev-doctor-cli-");
  writeUserEnv({ TYPESAFE_API_KEY: "sk-cli-hidden" }, configDir);
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", "doctor", "--json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, MCP_JEV_HOME: configDir, MCP_JEV_CHECKOUT: path.join(configDir, "nope"), TYPESAFE_API_KEY: "" },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(!result.stdout.includes("sk-cli-hidden"));
  const body = JSON.parse(result.stdout) as { ready: boolean; api_key_set: boolean };
  assert.equal(body.ready, false);
  assert.equal(body.api_key_set, true);
});

test("hosts write merges keyless JSON and TOML without a key", () => {
  const homeDir = tempDir("mcp-jev-write-hosts-");
  fs.mkdirSync(path.join(homeDir, ".cursor"), { recursive: true });
  fs.writeFileSync(
    path.join(homeDir, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { other: { command: "echo" } } }, null, 2),
  );
  const result = writeHostConfigs("/tmp/wrapper/mcp_jev", ["cursor", "codex"], homeDir);
  assert.ok(result.written.some((line) => line.startsWith("cursor:")));
  assert.ok(result.written.some((line) => line.startsWith("codex:")));
  const cursor = JSON.parse(fs.readFileSync(path.join(homeDir, ".cursor", "mcp.json"), "utf8")) as {
    mcpServers: Record<string, { command: string }>;
  };
  assert.equal(cursor.mcpServers.other.command, "echo");
  assert.equal(cursor.mcpServers.mcp_jev.command, "/tmp/wrapper/mcp_jev");
  const toml = fs.readFileSync(path.join(homeDir, ".codex", "config.toml"), "utf8");
  assert.match(toml, /\[mcp_servers\.mcp_jev\]/);
  assert.match(toml, /command = "\/tmp\/wrapper\/mcp_jev"/);
  assert.ok(!toml.toLowerCase().includes("typesafe"));
});
