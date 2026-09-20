import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { type Questions, type SystemOneResult } from "@typesafe-ai/sdk";

import {
  DOGFOOD_HELP,
  DOGFOOD_HISTORY_KEEP,
  doctorInstallOk,
  formatDogfoodMarkdown,
  gateBlindWindTunnel,
  historyStamp,
  inventBlindWindTunnel,
  parseDogfoodArgs,
  redactSecrets,
  redactText,
  runDogfood,
  writeDogfoodReports,
  type DogfoodReport,
} from "../src/dogfood.js";
import { parseCustomRunInput } from "../src/custom-questions.js";
import { writeHomeRecord, writeUserEnv } from "../src/user-config.js";

const root = fileURLToPath(new URL("..", import.meta.url));

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function prepareInstall(configDir: string, repoHome: string, key?: string): void {
  writeHomeRecord(repoHome, configDir);
  fs.mkdirSync(path.join(repoHome, "dist"), { recursive: true });
  fs.writeFileSync(path.join(repoHome, "package.json"), `${JSON.stringify({ name: "mcp_jev" })}\n`);
  fs.writeFileSync(path.join(repoHome, "dist", "index.js"), "#!/usr/bin/env node\n");
  fs.mkdirSync(path.join(configDir, "bin"), { recursive: true });
  fs.writeFileSync(path.join(configDir, "bin", "mcp_jev"), "#!/bin/sh\n", { mode: 0o755 });
  if (key) {
    writeUserEnv({ TYPESAFE_API_KEY: key }, configDir);
  }
}

function mockSystemOne(input: {
  questions: Questions;
  model?: string;
}): SystemOneResult<Questions> {
  const answers: Record<string, unknown> = {};
  for (const [id, question] of Object.entries(input.questions ?? {})) {
    if (!question || typeof question !== "object") continue;
    const typed = question as { type?: string; criteria?: unknown };
    if (typed.type === "choice") {
      const keys =
        typed.criteria && typeof typed.criteria === "object" && !Array.isArray(typed.criteria)
          ? Object.keys(typed.criteria as object)
          : ["ship"];
      const choice = keys[0] ?? "ship";
      answers[id] = { type: "choice", choice, confidence: 0.8, probabilities: { [choice]: 0.8 } };
    } else if (typed.type === "noul") {
      answers[id] = { type: "noul", noul: 0.2 };
    } else {
      answers[id] = {
        type: "score",
        score: 1,
        confidence: 0.6,
        legend: { 0: "low", 1: "mid" },
        probabilities: { 1: 0.6 },
      };
    }
  }
  return {
    model: input.model ?? "jev-latest",
    answers: answers as SystemOneResult<Questions>["answers"],
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function runCli(args: string[], extraEnv: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/index.ts", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TYPESAFE_API_KEY: "", ...extraEnv },
  });
}

function assertReportShape(report: DogfoodReport): void {
  assert.equal(report.server, "mcp_jev");
  assert.equal(typeof report.server_version, "string");
  assert.equal(typeof report.ok, "boolean");
  assert.equal(typeof report.started_at, "string");
  assert.equal(typeof report.elapsed_ms, "number");
  assert.equal(typeof report.out_dir, "string");
  assert.equal(typeof report.skip_live, "boolean");
  assert.equal(typeof report.doctor.ready, "boolean");
  assert.equal(typeof report.doctor.install_ok, "boolean");
  assert.equal(typeof report.doctor.api_key_set, "boolean");
  assert.ok(Array.isArray(report.doctor.checks));
  assert.ok(Array.isArray(report.packs.ids));
  assert.equal(typeof report.wind_tunnel.invented_before_list, "boolean");
  assert.equal(typeof report.wind_tunnel.invent_fail, "boolean");
  assert.ok(["ok", "skipped", "fail"].includes(report.wind_tunnel.status));
  assert.ok(["ok", "skipped", "fail"].includes(report.stock_pack.status));
  assert.ok(["ok", "skipped", "fail"].includes(report.urlcheck.status));
  assert.equal(typeof report.files.json, "string");
  assert.equal(typeof report.files.md, "string");
}

test("parseDogfoodArgs accepts json, skip-live, urlcheck-base, out", () => {
  const args = parseDogfoodArgs([
    "--json",
    "--skip-live",
    "--urlcheck-base",
    "http://127.0.0.1:3000",
    "--out",
    "/tmp/dogfood-out",
  ]);
  assert.equal(args.json, true);
  assert.equal(args.skipLive, true);
  assert.equal(args.urlcheckBase, "http://127.0.0.1:3000");
  assert.equal(args.outDir, "/tmp/dogfood-out");
  assert.throws(() => parseDogfoodArgs(["--nope"]), /Unknown dogfood flag/);
});

test("inventBlindWindTunnel is valid run_questions input and gates without a key", () => {
  const body = inventBlindWindTunnel();
  const parsed = parseCustomRunInput(body);
  assert.equal(parsed.questions.length, 2);
  assert.deepEqual(
    parsed.questions.map((question) => question.id),
    ["is_breaking", "next_action"],
  );
  assert.equal(
    gateBlindWindTunnel({
      is_breaking: { noul: 0.2 },
      next_action: { choice: "ship" },
    }),
    "ship",
  );
  assert.equal(
    gateBlindWindTunnel({
      is_breaking: { noul: 0.9 },
      next_action: { choice: "ship" },
    }),
    "block",
  );
});

test("redactSecrets strips key-shaped values from reports", () => {
  const redacted = redactSecrets({
    message: "auth failed for sk-super-secret-key-value",
    nested: { note: "TYPESAFE_API_KEY=sk-also-hidden-xx" },
  }) as { message: string; nested: { note: string } };
  assert.equal(redacted.message.includes("sk-super-secret-key-value"), false);
  assert.match(redacted.message, /sk-\[redacted\]/);
  assert.doesNotMatch(redacted.nested.note, /sk-also-hidden/);
  assert.equal(redactText("Bearer sk-abcdefghijkl").includes("sk-abcdefghijkl"), false);
});

test("dogfood --skip-live writes report, exits 0 without a key, never prints the key", async () => {
  const configDir = tempDir("mcp-jev-dogfood-ok-");
  const repoHome = tempDir("mcp-jev-dogfood-repo-");
  const outDir = path.join(configDir, "dogfood");
  prepareInstall(configDir, repoHome);
  writeUserEnv({ TYPESAFE_API_KEY: "" }, configDir);

  const { report, exitCode, markdown } = await runDogfood(["--skip-live", "--out", outDir], {
    env: { MCP_JEV_HOME: configDir, TYPESAFE_API_KEY: "sk-must-not-appear-xxxxxx" },
    userConfigDir: configDir,
    repoHome,
    homeDir: tempDir("mcp-jev-dogfood-home-"),
  });

  assert.equal(exitCode, 0, JSON.stringify(report, null, 2));
  assert.equal(report.ok, true);
  assert.equal(report.doctor.install_ok, true);
  assert.equal(report.wind_tunnel.invent_fail, false);
  assert.equal(report.wind_tunnel.invented_before_list, true);
  assert.equal(report.wind_tunnel.status, "skipped");
  assert.equal(report.stock_pack.status, "skipped");
  assert.equal(report.urlcheck.status, "skipped");
  assert.ok(report.packs.ids.includes("computer_use_step"));
  assert.ok(report.packs.ids.includes("model_router"));
  assertReportShape(report);
  assert.ok(fs.existsSync(path.join(outDir, "latest.json")));
  assert.ok(fs.existsSync(path.join(outDir, "latest.md")));
  const json = fs.readFileSync(path.join(outDir, "latest.json"), "utf8");
  const md = fs.readFileSync(path.join(outDir, "latest.md"), "utf8");
  assert.ok(!json.includes("sk-must-not-appear"));
  assert.ok(!md.includes("sk-must-not-appear"));
  assert.ok(!markdown.includes("sk-must-not-appear"));
  assert.match(md, /PASS/);
  assert.match(md, /Blind Wind-Tunnel/);
});

test("dogfood exits 1 when doctor install checks fail", async () => {
  const configDir = tempDir("mcp-jev-dogfood-bad-");
  const outDir = path.join(configDir, "dogfood");
  const { report, exitCode } = await runDogfood(["--skip-live", "--out", outDir], {
    env: { MCP_JEV_HOME: configDir, TYPESAFE_API_KEY: "" },
    userConfigDir: configDir,
    repoHome: path.join(configDir, "missing-checkout"),
    homeDir: tempDir("mcp-jev-dogfood-bad-home-"),
  });
  assert.equal(exitCode, 1);
  assert.equal(report.ok, false);
  assert.equal(report.doctor.install_ok, false);
  assert.equal(doctorInstallOk({ checks: report.doctor.checks }), false);
  assert.ok(fs.existsSync(path.join(outDir, "latest.md")));
});

test("invent-fail exits 1 and is recorded", async () => {
  const configDir = tempDir("mcp-jev-dogfood-invent-");
  const repoHome = tempDir("mcp-jev-dogfood-invent-repo-");
  const outDir = path.join(configDir, "dogfood");
  prepareInstall(configDir, repoHome);
  const { report, exitCode } = await runDogfood(["--skip-live", "--out", outDir], {
    env: { MCP_JEV_HOME: configDir, TYPESAFE_API_KEY: "" },
    userConfigDir: configDir,
    repoHome,
    inventFixture: () => ({
      state: { path: "x.ts" },
      questions: [{ id: "essay", type: "essay", instructions: "write a review", criteria: {} }],
    }),
  });
  assert.equal(exitCode, 1);
  assert.equal(report.wind_tunnel.invent_fail, true);
  assert.equal(report.wind_tunnel.status, "fail");
  assert.equal(report.ok, false);
});

test("live wind-tunnel + stock pack succeed with mocked systemOne", async () => {
  const configDir = tempDir("mcp-jev-dogfood-live-");
  const repoHome = tempDir("mcp-jev-dogfood-live-repo-");
  const outDir = path.join(configDir, "dogfood");
  prepareInstall(configDir, repoHome, "sk-hidden-live-key-xxxx");
  const { report, exitCode } = await runDogfood(["--out", outDir], {
    env: { MCP_JEV_HOME: configDir, TYPESAFE_API_KEY: "" },
    userConfigDir: configDir,
    repoHome,
    systemOne: async (input) => mockSystemOne(input),
  });
  assert.equal(exitCode, 0, JSON.stringify(report, null, 2));
  assert.equal(report.wind_tunnel.status, "ok");
  assert.equal(report.wind_tunnel.invent_fail, false);
  assert.equal(report.wind_tunnel.gate, "ship");
  assert.equal(report.stock_pack.status, "ok");
  assert.ok(report.stock_pack.pack_id === "computer_use_step" || report.stock_pack.pack_id === "model_router");
  const dumped = JSON.stringify(report);
  assert.ok(!dumped.includes("sk-hidden-live-key"));
});

test("live TypeSafe error is redacted and exits 1", async () => {
  const configDir = tempDir("mcp-jev-dogfood-err-");
  const repoHome = tempDir("mcp-jev-dogfood-err-repo-");
  const outDir = path.join(configDir, "dogfood");
  prepareInstall(configDir, repoHome, "sk-leaky-secret-key-zzzz");
  const { report, exitCode, markdown } = await runDogfood(["--out", outDir], {
    env: { MCP_JEV_HOME: configDir, TYPESAFE_API_KEY: "" },
    userConfigDir: configDir,
    repoHome,
    systemOne: async () => {
      throw new Error("upstream rejected sk-leaky-secret-key-zzzz");
    },
  });
  assert.equal(exitCode, 1);
  assert.equal(report.wind_tunnel.status, "fail");
  assert.ok(!JSON.stringify(report).includes("sk-leaky-secret-key-zzzz"));
  assert.ok(!markdown.includes("sk-leaky-secret-key-zzzz"));
  assert.match(report.wind_tunnel.error ?? "", /sk-\[redacted\]/);
});

test("urlcheck skips when the origin is down", async () => {
  const configDir = tempDir("mcp-jev-dogfood-url-");
  const repoHome = tempDir("mcp-jev-dogfood-url-repo-");
  const outDir = path.join(configDir, "dogfood");
  prepareInstall(configDir, repoHome);
  const { report, exitCode } = await runDogfood(
    ["--skip-live", "--out", outDir, "--urlcheck-base", "http://127.0.0.1:1"],
    {
      env: { MCP_JEV_HOME: configDir, TYPESAFE_API_KEY: "" },
      userConfigDir: configDir,
      repoHome,
      fetchImpl: async () => {
        throw Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" });
      },
    },
  );
  assert.equal(exitCode, 0, JSON.stringify(report, null, 2));
  assert.equal(report.urlcheck.status, "skipped");
  assert.match(report.urlcheck.skip_reason ?? "", /server not up/);
});

test("hard urlcheck fail exits 1", async () => {
  const configDir = tempDir("mcp-jev-dogfood-5xx-");
  const repoHome = tempDir("mcp-jev-dogfood-5xx-repo-");
  const outDir = path.join(configDir, "dogfood");
  prepareInstall(configDir, repoHome);
  const fakeFetch = (async () =>
    ({
      status: 500,
      headers: { get: () => "text/plain" },
      arrayBuffer: async () => new TextEncoder().encode("internal server error").buffer,
    }) as unknown as Response) as typeof fetch;

  const { report, exitCode } = await runDogfood(
    ["--skip-live", "--out", outDir, "--urlcheck-base", "http://127.0.0.1:3999"],
    {
      env: { MCP_JEV_HOME: configDir, TYPESAFE_API_KEY: "" },
      userConfigDir: configDir,
      repoHome,
      fetchImpl: fakeFetch,
      discoverCwd: repoHome,
    },
  );
  assert.equal(exitCode, 1);
  assert.equal(report.urlcheck.status, "fail");
  assert.ok((report.urlcheck.hard_failures ?? 0) > 0);
});

test("history keeps last N=10", () => {
  const outDir = tempDir("mcp-jev-dogfood-hist-");
  const skeleton = {
    ok: true,
    server: "mcp_jev",
    server_version: "0.0.11",
    started_at: "2026-01-01T00:00:00.000Z",
    elapsed_ms: 1,
    out_dir: outDir,
    skip_live: true,
    doctor: { ready: false, install_ok: true, api_key_set: false, api_key_source: "none", checks: [] },
    packs: { status: "ok" as const, ids: [], ms: 0 },
    wind_tunnel: {
      invented_before_list: true,
      invent_fail: false,
      status: "skipped" as const,
      ms: 0,
    },
    stock_pack: { status: "skipped" as const, ms: 0 },
    urlcheck: { status: "skipped" as const, ms: 0 },
    files: { json: "", md: "" },
  } satisfies DogfoodReport;

  for (let i = 0; i < DOGFOOD_HISTORY_KEEP + 3; i += 1) {
    const stamp = historyStamp(new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    writeDogfoodReports(outDir, { ...skeleton, started_at: stamp }, stamp);
  }
  const jsons = fs.readdirSync(path.join(outDir, "history")).filter((name) => name.endsWith(".json"));
  assert.equal(jsons.length, DOGFOOD_HISTORY_KEEP);
  assert.ok(fs.existsSync(path.join(outDir, "latest.json")));
  assert.ok(fs.existsSync(path.join(outDir, "latest.md")));
});

test("formatDogfoodMarkdown mentions the anti-pattern and does not leak keys", () => {
  const md = formatDogfoodMarkdown({
    ok: true,
    server: "mcp_jev",
    server_version: "0.0.11",
    started_at: "2026-09-20T00:00:00.000Z",
    elapsed_ms: 12,
    out_dir: "/tmp/x",
    skip_live: true,
    doctor: {
      ready: false,
      install_ok: true,
      api_key_set: false,
      api_key_source: "none",
      checks: [{ id: "api_key", ok: false, message: "no key" }],
    },
    packs: { status: "ok", ids: ["computer_use_step"], ms: 1 },
    wind_tunnel: {
      invented_before_list: true,
      invent_fail: false,
      status: "skipped",
      ms: 0,
      skip_reason: "no TypeSafe key",
    },
    stock_pack: { status: "skipped", ms: 0, skip_reason: "no TypeSafe key" },
    urlcheck: { status: "skipped", ms: 0, skip_reason: "no --urlcheck-base" },
    files: { json: "/tmp/x/latest.json", md: "/tmp/x/latest.md" },
  });
  assert.match(md, /not.*mcp_jev broken/i);
  assert.match(md, /run_questions/);
  assert.match(DOGFOOD_HELP, /spawn \/bin\/zsh ENOENT/);
});

test("dogfood CLI help and --json skip-live never print a key", () => {
  const help = runCli(["help"], {});
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /mcp_jev dogfood/);
  assert.match(help.stdout, /mcp_jev urlcheck/);
  assert.match(help.stdout, /mcp_jev doctor/);

  const configDir = tempDir("mcp-jev-dogfood-cli-");
  const repoHome = tempDir("mcp-jev-dogfood-cli-repo-");
  prepareInstall(configDir, repoHome);
  const outDir = path.join(configDir, "reports");
  const result = runCli(["dogfood", "--json", "--skip-live", "--out", outDir], {
    MCP_JEV_HOME: configDir,
    MCP_JEV_CHECKOUT: repoHome,
    TYPESAFE_API_KEY: "sk-cli-must-not-print-yyyy",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(!result.stdout.includes("sk-cli-must-not-print"));
  assert.ok(!result.stderr.includes("sk-cli-must-not-print"));
  const body = JSON.parse(result.stdout) as DogfoodReport;
  assert.equal(body.ok, true);
  assertReportShape(body);
  assert.ok(fs.existsSync(path.join(outDir, "latest.md")));
});
