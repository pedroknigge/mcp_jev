#!/usr/bin/env node
/**
 * Stdio MCP smoke: ping → list_packs → describe_pack + run_pack(example_state)
 * for every pack. Default is mocked TypeSafe (no network). --live hits Jev.
 *
 *   npm run smoke:packs
 *   npm run smoke:packs -- --live
 *
 * --live is skipped in CI unless TYPESAFE_API_KEY is set and SMOKE_LIVE=1.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const ROOT = process.env.MCP_JEV_CHECKOUT && existsSync(join(process.env.MCP_JEV_CHECKOUT, "package.json"))
  ? process.env.MCP_JEV_CHECKOUT
  : join(SCRIPT_DIR, "..");

const MOCK_KEY = "mcp-jev-smoke-mock";

function hasFlag(name) {
  return process.argv.includes(name);
}

function isCi() {
  const ci = process.env.CI;
  return ci === "true" || ci === "1" || process.env.GITHUB_ACTIONS === "true";
}

function parseDotEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function userConfigDir() {
  return (
    process.env.MCP_JEV_HOME?.trim() ||
    process.env.MCP_JEV_CONFIG?.trim() ||
    join(process.env.HOME || process.env.USERPROFILE || "", ".mcp_jev")
  );
}

function resolveLiveKey() {
  const fromEnv = process.env.TYPESAFE_API_KEY?.trim();
  if (fromEnv) {
    return { set: true, source: "env" };
  }
  const file = join(userConfigDir(), ".env");
  if (!existsSync(file)) {
    return { set: false, source: "none" };
  }
  const parsed = parseDotEnv(readFileSync(file, "utf8"));
  if (parsed.TYPESAFE_API_KEY?.trim()) {
    return { set: true, source: "user_store" };
  }
  return { set: false, source: "none" };
}

function shouldSkipLive() {
  if (!isCi()) {
    return false;
  }
  const hasKey = Boolean(process.env.TYPESAFE_API_KEY?.trim());
  return !(hasKey && process.env.SMOKE_LIVE === "1");
}

function printHelp() {
  console.log(`smoke-all-packs — ping, list_packs, then describe+run every pack

Usage:
  npm run smoke:packs              mocked TypeSafe (default, no network)
  npm run smoke:packs -- --live    real TypeSafe from env or ~/.mcp_jev/.env
  node --import tsx scripts/smoke-all-packs.mjs [--live]

--live is skipped in CI unless TYPESAFE_API_KEY is set and SMOKE_LIVE=1.
Exit non-zero if ping, list_packs, or any pack fails.
`);
}

function resolveServerCommand() {
  const tsx = join(ROOT, "node_modules", "tsx");
  const src = join(ROOT, "src", "index.ts");
  const dist = join(ROOT, "dist", "index.js");
  if (existsSync(src) && existsSync(tsx)) {
    return {
      command: process.execPath,
      liveArgs: ["--import", "tsx", src],
      mockArgs: ["--import", "tsx", SCRIPT_PATH, "--as-mock-server"],
    };
  }
  if (existsSync(dist)) {
    return {
      command: process.execPath,
      liveArgs: [dist],
      mockArgs: [SCRIPT_PATH, "--as-mock-server"],
    };
  }
  throw new Error("smoke-all-packs: missing src/index.ts+tsx or dist/index.js (run npm run build)");
}

function firstChoice(criteria) {
  if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
    const keys = Object.keys(criteria);
    if (keys.length > 0) {
      return keys[0];
    }
  }
  return "unknown";
}

/** Same inject-systemOne pattern as test/*.test.ts — synthetic answers, no HTTP. */
function mockSystemOne(input) {
  const answers = {};
  for (const [id, question] of Object.entries(input.questions ?? {})) {
    if (!question || typeof question !== "object") {
      continue;
    }
    if (question.type === "choice") {
      const choice = firstChoice(question.criteria);
      answers[id] = {
        type: "choice",
        choice,
        confidence: 0.7,
        probabilities: { [choice]: 0.7 },
      };
    } else if (question.type === "noul") {
      answers[id] = { type: "noul", noul: 0.12 };
    } else if (question.type === "score") {
      answers[id] = {
        type: "score",
        score: 1,
        confidence: 0.6,
        legend: { 0: "low", 1: "mid", 2: "high" },
        probabilities: { 1: 0.6 },
      };
    }
  }
  return {
    model: input.model ?? "jev-latest",
    answers,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

async function loadServerModules() {
  const useSrc = process.execArgv.some((arg) => String(arg).includes("tsx")) && existsSync(join(ROOT, "src", "server.ts"));
  const base = pathToFileURL(useSrc ? join(ROOT, "src") : join(ROOT, "dist")).href;
  const [serverMod, configMod] = await Promise.all([
    import(`${base}/server.js`),
    import(`${base}/config.js`),
  ]);
  return { createServer: serverMod.createServer, loadConfig: configMod.loadConfig };
}

async function runMockServer() {
  const { createServer, loadConfig } = await loadServerModules();
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const config = loadConfig(
    { ...process.env, TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY || MOCK_KEY },
    { readUserStore: false },
  );
  const server = createServer({ config, systemOne: async (input) => mockSystemOne(input) });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function redact(text) {
  return String(text)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
    .replace(MOCK_KEY, "mock-key");
}

function toolText(result) {
  const content = result?.content?.[0];
  if (!content || content.type !== "text") {
    throw new Error("tool result missing text content");
  }
  return content.text;
}

function parseToolJson(result) {
  return JSON.parse(toolText(result));
}

function oneLineError(err) {
  const message = err instanceof Error ? err.message : String(err);
  return redact(message.replace(/\s+/g, " ").trim()).slice(0, 160);
}

function printTable(rows) {
  const headers = ["pack", "ok", "ms", "error"];
  const widths = {
    pack: Math.max(headers[0].length, ...rows.map((row) => row.pack.length)),
    ok: Math.max(headers[1].length, ...rows.map((row) => row.ok.length)),
    ms: Math.max(headers[2].length, ...rows.map((row) => String(row.ms).length)),
    error: Math.max(headers[3].length, ...rows.map((row) => row.error.length)),
  };
  const line = (pack, ok, ms, error) =>
    `${pack.padEnd(widths.pack)}  ${ok.padEnd(widths.ok)}  ${String(ms).padStart(widths.ms)}  ${error}`;
  console.log(line(headers[0], headers[1], headers[2], headers[3]));
  console.log(
    `${"-".repeat(widths.pack)}  ${"-".repeat(widths.ok)}  ${"-".repeat(widths.ms)}  ${"-".repeat(Math.max(widths.error, 5))}`,
  );
  for (const row of rows) {
    console.log(line(row.pack, row.ok, row.ms, row.error));
  }
}

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const body = (() => {
      try {
        return parseToolJson(result);
      } catch {
        return { message: toolText(result) };
      }
    })();
    const code = body.code ? `${body.code}: ` : "";
    throw new Error(`${code}${body.message ?? toolText(result)}`);
  }
  return parseToolJson(result);
}

async function runSmoke() {
  const live = hasFlag("--live");
  if (live && shouldSkipLive()) {
    console.log("smoke-all-packs: skip --live in CI (set TYPESAFE_API_KEY and SMOKE_LIVE=1)");
    return 0;
  }

  if (live) {
    const key = resolveLiveKey();
    if (!key.set) {
      console.error(
        "smoke-all-packs --live: no TypeSafe key (set TYPESAFE_API_KEY or run mcp_jev config set-key)",
      );
      return 1;
    }
  }

  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { getDefaultEnvironment, StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const { command, liveArgs, mockArgs } = resolveServerCommand();
  const mockHome = live ? undefined : mkdtempSync(join(tmpdir(), "mcp-jev-smoke-"));
  const env = live
    ? { ...getDefaultEnvironment(), ...process.env }
    : {
        ...getDefaultEnvironment(),
        TYPESAFE_API_KEY: MOCK_KEY,
        MCP_JEV_HOME: mockHome,
        MCP_JEV_CONFIG: mockHome,
      };

  const transport = new StdioClientTransport({
    command,
    args: live ? liveArgs : mockArgs,
    cwd: ROOT,
    env,
  });

  const client = new Client({ name: "mcp_jev-smoke-all-packs", version: "0.0.0" });

  try {
    await client.connect(transport);

    const ping = await callTool(client, "ping", {});
    if (ping.server !== "mcp_jev") {
      throw new Error(`ping server mismatch: ${JSON.stringify(ping)}`);
    }
    if (typeof ping.api_key_set !== "boolean") {
      throw new Error("ping.api_key_set must be boolean");
    }
    if (!live && !ping.api_key_set) {
      throw new Error("mocked smoke expected ping.api_key_set=true");
    }
    if (JSON.stringify(ping).includes("TYPESAFE_API_KEY") || /sk-[A-Za-z0-9]{8,}/.test(JSON.stringify(ping))) {
      throw new Error("ping leaked a key-shaped value");
    }

    const listed = await callTool(client, "list_packs", {});
    const packs = listed.packs ?? [];
    if (!Array.isArray(packs) || packs.length === 0) {
      throw new Error("list_packs returned no packs");
    }

    console.log(
      `smoke-all-packs: ${live ? "live" : "mocked"}  packs=${packs.length}  ping.api_key_set=${ping.api_key_set}`,
    );

    const rows = [];
    for (const pack of packs) {
      const started = Date.now();
      try {
        const described = await callTool(client, "describe_pack", { pack_id: pack.id });
        if (!described.example_state || typeof described.example_state !== "object") {
          throw new Error("describe_pack missing example_state");
        }
        const ran = await callTool(client, "run_pack", {
          pack_id: pack.id,
          state: described.example_state,
        });
        if (!ran.answers || typeof ran.answers !== "object") {
          throw new Error("run_pack missing answers");
        }
        rows.push({ pack: pack.id, ok: "true", ms: Date.now() - started, error: "" });
      } catch (err) {
        rows.push({ pack: pack.id, ok: "false", ms: Date.now() - started, error: oneLineError(err) });
      }
    }

    printTable(rows);
    const failed = rows.filter((row) => row.ok !== "true");
    if (failed.length > 0) {
      console.error(`smoke-all-packs: ${failed.length}/${rows.length} failed`);
      return 1;
    }
    console.log(`smoke-all-packs: ${rows.length}/${rows.length} ok`);
    return 0;
  } catch (err) {
    console.error(`smoke-all-packs: ${oneLineError(err)}`);
    return 1;
  } finally {
    try {
      await client.close();
    } catch {
      // already closed
    }
    if (mockHome) {
      rmSync(mockHome, { recursive: true, force: true });
    }
  }
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printHelp();
    return;
  }
  if (hasFlag("--as-mock-server")) {
    await runMockServer();
    return;
  }
  process.exitCode = await runSmoke();
}

try {
  await main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`smoke-all-packs: ${redact(message)}`);
  process.exitCode = 1;
}
