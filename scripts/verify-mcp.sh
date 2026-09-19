#!/usr/bin/env bash
# Stdio JSON-RPC smoke: initialize, tools/list, ping, list_packs. No TypeSafe call.
set -euo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR=""
fi

ROOT="${MCP_JEV_CHECKOUT:-}"
if [[ -z "$ROOT" && -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/../package.json" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
ROOT="${ROOT:-$PWD}"

if [[ -f "$ROOT/src/index.ts" && -d "$ROOT/node_modules/tsx" ]]; then
  ENTRY=(node --import tsx "$ROOT/src/index.ts")
elif [[ -f "$ROOT/dist/index.js" ]]; then
  ENTRY=(node "$ROOT/dist/index.js")
else
  echo "verify-mcp: missing $ROOT/dist/index.js (run npm run build)" >&2
  exit 1
fi

# Smoke must not call TypeSafe.
unset TYPESAFE_API_KEY || true

node --input-type=module - "$ROOT" "${ENTRY[@]}" <<'JS'
import { spawn } from "node:child_process";
import readline from "node:readline";

const root = process.argv[2];
const command = process.argv[3];
const args = process.argv.slice(4);

const child = spawn(command, args, {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, TYPESAFE_API_KEY: "" },
});

const pending = new Map();
let nextId = 1;
let stderr = "";

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

const rl = readline.createInterface({ input: child.stdout });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (message.id != null && pending.has(message.id)) {
    const { resolve } = pending.get(message.id);
    pending.delete(message.id);
    resolve(message);
  }
});

function request(method, params) {
  const id = nextId++;
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 15_000);
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer);
        resolve(message);
      },
    });
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return promise;
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function fail(message) {
  child.kill("SIGTERM");
  console.error(message);
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  process.exit(1);
}

try {
  const initialized = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp_jev-verify", version: "0.0.0" },
  });
  if (initialized.error) {
    fail(`initialize error: ${JSON.stringify(initialized.error)}`);
  }
  const server = initialized.result?.serverInfo ?? {};
  if (server.name && server.name !== "mcp_jev") {
    fail(`unexpected server name: ${server.name}`);
  }
  notify("notifications/initialized", {});

  const listed = await request("tools/list", {});
  const names = (listed.result?.tools ?? []).map((tool) => tool.name).sort();
  const expected = ["describe_pack", "list_packs", "ping", "run_pack"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    fail(`tools/list mismatch: ${JSON.stringify(names)}`);
  }

  const ping = await request("tools/call", { name: "ping", arguments: {} });
  const pingText = ping.result?.content?.[0]?.text;
  const pingBody = JSON.parse(pingText);
  if (pingBody.server !== "mcp_jev") {
    fail(`ping server mismatch: ${pingText}`);
  }
  if (typeof pingBody.api_key_set !== "boolean") {
    fail("ping.api_key_set must be boolean");
  }
  if (JSON.stringify(pingBody).includes("TYPESAFE_API_KEY") || /sk-[A-Za-z0-9]{8,}/.test(JSON.stringify(pingBody))) {
    fail("ping leaked a key-shaped value");
  }

  const packs = await request("tools/call", { name: "list_packs", arguments: {} });
  const packsText = packs.result?.content?.[0]?.text;
  const packsBody = JSON.parse(packsText);
  const ids = (packsBody.packs ?? []).map((pack) => pack.id);
  for (const id of ["computer_use_step", "model_router", "review_diff", "skill_router", "command_risk"]) {
    if (!ids.includes(id)) {
      fail(`list_packs missing ${id}: ${ids.join(", ")}`);
    }
  }

  console.log("verify-mcp: ok");
  console.log(`initialize: ${server.name ?? "mcp_jev"} ${server.version ?? ""}`.trim());
  console.log(`tools/list: ${names.join(", ")}`);
  console.log(`ping: api_key_set=${pingBody.api_key_set} packs=${pingBody.packs}`);
  console.log(`list_packs: ${ids.join(", ")}`);
  child.stdin.end();
  child.kill("SIGTERM");
  process.exit(0);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
JS
