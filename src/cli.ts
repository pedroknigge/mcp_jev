import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as stdinStream, stdout as stdoutStream } from "node:process";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.js";
import { formatDoctorReport, runDoctor, wrapperPath } from "./doctor.js";
import { formatHostSnippets, parseHostIds, writeHostConfigs, type HostId } from "./hosts.js";
import { clearNotReadyMarker } from "./ready.js";
import { parseScanArgs, runScan, SCAN_HELP } from "./scan.js";
import {
  defaultRepoHome,
  defaultUserConfigDir,
  readHomeRecord,
  userEnvPath,
  writeHomeRecord,
  writeUserEnv,
} from "./user-config.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

function printHelp(): void {
  console.log(`mcp_jev ${SERVER_VERSION}

Usage:
  mcp_jev                     Start the stdio MCP server
  mcp_jev doctor              Check checkout, dist, wrapper, key (boolean), hosts
  mcp_jev doctor --json       Same, machine-readable (never includes the key)
  mcp_jev hosts print         Keyless snippets for Cursor/Claude/Codex/Grok/Antigravity
  mcp_jev hosts write [ids]   Merge snippets into host configs (all or comma list)
  mcp_jev scan <path>         code_audit Pass 1 over a repo (signals-only, parallel)
  mcp_jev scan <path> --dry-run
  mcp_jev scan <path> --pass2 N [--concurrency N]
  mcp_jev config set-key      Store TYPESAFE_API_KEY in ~/.mcp_jev/.env (once)
  mcp_jev config set-key KEY  Same, non-interactive
  mcp_jev config status       Show paths and api_key_set (never prints the key)
  mcp_jev config path         Print the user config directory
  mcp_jev help

The TypeSafe key is installed ONCE in ~/.mcp_jev/.env (override: MCP_JEV_HOME).
Any agent that attaches this MCP reuses it. Host configs should point at
~/.mcp_jev/bin/mcp_jev and omit the key.

Repo: https://github.com/pedroknigge/mcp_jev
`);
}

async function readKeyInteractive(): Promise<string> {
  if (!stdinStream.isTTY) {
    throw new Error(
      "No TTY. Pass the key: mcp_jev config set-key YOUR_KEY  (or set TYPESAFE_API_KEY and re-run).",
    );
  }
  const rl = readline.createInterface({ input: stdinStream, output: stdoutStream });
  try {
    const key = await rl.question("TYPESAFE_API_KEY (hidden not available in all shells; paste then Enter): ");
    return key;
  } finally {
    rl.close();
  }
}

function resolvedWrapper(configDir: string): string {
  const existing = wrapperPath(configDir);
  if (fs.existsSync(existing)) {
    return existing;
  }
  return path.join(configDir, "bin", process.platform === "win32" ? "mcp_jev.cmd" : "mcp_jev");
}

export async function runCli(argv: string[]): Promise<void> {
  const [cmd, sub, ...rest] = argv;
  if (cmd === "help" || cmd === "--help" || cmd === "-h" || !cmd) {
    printHelp();
    return;
  }

  const configDir = defaultUserConfigDir();

  if (cmd === "doctor") {
    const asJson = sub === "--json" || rest.includes("--json") || sub === "-j";
    const report = runDoctor({ userConfigDir: configDir, detectHosts: true });
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatDoctorReport(report).trimEnd());
    }
    if (!report.ready) {
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "scan") {
    const scanArgv = [sub, ...rest].filter((item): item is string => Boolean(item));
    let args;
    try {
      args = parseScanArgs(scanArgv, process.env);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }
    if (args.help) {
      console.log(SCAN_HELP.trimEnd());
      return;
    }
    if (!args.root) {
      console.error("scan requires a path. Try: mcp_jev scan . --dry-run");
      process.exitCode = 1;
      return;
    }
    const root = path.resolve(args.root);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      console.error(`scan path is not a directory: ${args.root}`);
      process.exitCode = 1;
      return;
    }
    const config = loadConfig(process.env, { userConfigDir: configDir });
    try {
      const { summary } = await runScan({
        root,
        concurrency: args.concurrency,
        dryRun: args.dryRun,
        pass2: args.pass2,
        config,
      });
      if (summary.errors > 0) {
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
    return;
  }

  if (cmd === "hosts") {
    const command = resolvedWrapper(configDir);
    if (sub === "print" || !sub) {
      console.log(formatHostSnippets(command, os.homedir()).trimEnd());
      return;
    }
    if (sub === "write") {
      let ids: HostId[];
      try {
        ids = parseHostIds(rest[0]);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }
      const result = writeHostConfigs(command, ids, os.homedir());
      console.log(JSON.stringify({ command, ...result }, null, 2));
      if (result.errors.length > 0) {
        process.exitCode = 1;
      }
      return;
    }
    console.error(`Unknown hosts command "${sub}". Try: mcp_jev hosts print | mcp_jev hosts write all`);
    process.exitCode = 1;
    return;
  }

  if (cmd !== "config") {
    console.error(`Unknown command "${cmd}". Try: mcp_jev help`);
    process.exitCode = 1;
    return;
  }

  if (sub === "path") {
    console.log(configDir);
    return;
  }

  if (sub === "status") {
    const config = loadConfig(process.env, { userConfigDir: configDir });
    const payload = {
      server: SERVER_NAME,
      server_version: SERVER_VERSION,
      repo_home: readHomeRecord(configDir) ?? defaultRepoHome(),
      user_config_dir: configDir,
      env_file: userEnvPath(configDir),
      env_file_exists: fs.existsSync(userEnvPath(configDir)),
      api_key_set: config.apiKeySet,
      api_key_source: config.apiKeySource,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (sub === "set-key") {
    const fromArg = rest[0]?.trim();
    const fromEnv = process.env.TYPESAFE_API_KEY?.trim();
    const key = fromArg || fromEnv || (await readKeyInteractive());
    if (!key.trim()) {
      console.error("Empty key. Get one at https://console.typesafe.ai");
      process.exitCode = 1;
      return;
    }
    const file = writeUserEnv({ TYPESAFE_API_KEY: key.trim() }, configDir);
    if (!readHomeRecord(configDir)) {
      writeHomeRecord(defaultRepoHome(), configDir);
    }
    clearNotReadyMarker(configDir);
    const config = loadConfig(process.env, { userConfigDir: configDir });
    console.log(`Wrote ${file} (chmod 600). api_key_set=${config.apiKeySet}. Key is not printed.`);
    return;
  }

  console.error(`Unknown config command "${sub ?? ""}". Try: mcp_jev config status`);
  process.exitCode = 1;
}

const invokedAsScript =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]!) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  runCli(process.argv.slice(2)).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`mcp_jev failed: ${message}`);
    process.exit(1);
  });
}
