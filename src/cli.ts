import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as stdinStream, stdout as stdoutStream } from "node:process";

import { loadConfig } from "./config.js";
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
  mcp_jev config set-key      Store TYPESAFE_API_KEY in ~/.mcp_jev/.env (once)
  mcp_jev config set-key KEY  Same, non-interactive
  mcp_jev config status       Show paths and api_key_set (never prints the key)
  mcp_jev config path         Print the user config directory
  mcp_jev help

The TypeSafe key is installed ONCE in the user store. MCP host configs should
point at the wrapper (~/.mcp_jev/bin/mcp_jev) and omit the key.

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

export async function runCli(argv: string[]): Promise<void> {
  const [cmd, sub, ...rest] = argv;
  if (cmd === "help" || cmd === "--help" || cmd === "-h" || !cmd) {
    printHelp();
    return;
  }
  if (cmd !== "config") {
    console.error(`Unknown command "${cmd}". Try: mcp_jev help`);
    process.exitCode = 1;
    return;
  }

  const configDir = defaultUserConfigDir();

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
    const config = loadConfig(process.env, { userConfigDir: configDir });
    console.log(`Wrote ${file} (chmod 600). api_key_set=${config.apiKeySet}. Key is not printed.`);
    return;
  }

  console.error(`Unknown config command "${sub ?? ""}". Try: mcp_jev config status`);
  process.exitCode = 1;
}
