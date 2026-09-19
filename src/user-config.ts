import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const USER_ENV_KEYS = ["TYPESAFE_API_KEY", "TYPESAFE_BASE_URL", "JEV_MODEL", "TYPESAFE_DEFAULT_MODEL"] as const;

export type UserEnv = Partial<Record<(typeof USER_ENV_KEYS)[number], string>>;

export type ApiKeySource = "env" | "user_store" | "none";

export function defaultUserConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return trim(env.MCP_JEV_HOME) || trim(env.MCP_JEV_CONFIG) || path.join(os.homedir(), ".mcp_jev");
}

export function defaultRepoHome(env: NodeJS.ProcessEnv = process.env): string {
  return trim(env.MCP_JEV_CHECKOUT) || path.join(os.homedir(), "mcp_jev");
}

export function userEnvPath(dir: string = defaultUserConfigDir()): string {
  return path.join(dir, ".env");
}

export function userHomeRecordPath(dir: string = defaultUserConfigDir()): string {
  return path.join(dir, "home");
}

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
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

function trim(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

export function readUserEnv(dir: string = defaultUserConfigDir()): UserEnv {
  const file = userEnvPath(dir);
  if (!fs.existsSync(file)) {
    return {};
  }
  const parsed = parseDotEnv(fs.readFileSync(file, "utf8"));
  const result: UserEnv = {};
  for (const key of USER_ENV_KEYS) {
    const value = trim(parsed[key]);
    if (value) {
      result[key] = value;
    }
  }
  return result;
}

export function writeUserEnv(values: UserEnv, dir: string = defaultUserConfigDir()): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = userEnvPath(dir);
  const existing = fs.existsSync(file) ? parseDotEnv(fs.readFileSync(file, "utf8")) : {};
  const merged: Record<string, string> = { ...existing };
  for (const key of USER_ENV_KEYS) {
    const next = trim(values[key]);
    if (next) {
      merged[key] = next;
    }
  }
  const body = [
    "# mcp_jev user store. Do not commit. chmod 600.",
    "# https://github.com/pedroknigge/mcp_jev",
    ...Object.entries(merged).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
  fs.writeFileSync(file, body, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(file, 0o600);
  } catch {
    // Windows may ignore POSIX modes.
  }
  return file;
}

export function writeHomeRecord(repoHome: string, dir: string = defaultUserConfigDir()): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = userHomeRecordPath(dir);
  fs.writeFileSync(file, `${repoHome.trim()}\n`, { encoding: "utf8", mode: 0o644 });
  return file;
}

export function readHomeRecord(dir: string = defaultUserConfigDir()): string | undefined {
  const file = userHomeRecordPath(dir);
  if (!fs.existsSync(file)) {
    return undefined;
  }
  return trim(fs.readFileSync(file, "utf8"));
}

export function resolveApiKey(
  env: NodeJS.ProcessEnv,
  stored: UserEnv,
): { apiKey: string | undefined; source: ApiKeySource } {
  if (stored.TYPESAFE_API_KEY) {
    return { apiKey: stored.TYPESAFE_API_KEY, source: "user_store" };
  }
  const fromEnv = trim(env.TYPESAFE_API_KEY);
  if (fromEnv) {
    return { apiKey: fromEnv, source: "env" };
  }
  return { apiKey: undefined, source: "none" };
}
