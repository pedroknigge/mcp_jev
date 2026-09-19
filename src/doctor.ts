import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadConfig } from "./config.js";
import { detectHosts, type HostDetection } from "./hosts.js";
import { hasNotReadyMarker } from "./ready.js";
import {
  defaultRepoHome,
  defaultUserConfigDir,
  readHomeRecord,
  userEnvPath,
} from "./user-config.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

export type DoctorCheck = {
  id: string;
  ok: boolean;
  required: boolean;
  message: string;
};

export type DoctorReport = {
  ok: boolean;
  ready: boolean;
  server: string;
  server_version: string;
  user_config_dir: string;
  repo_home: string;
  api_key_set: boolean;
  api_key_source: string;
  checks: DoctorCheck[];
  hosts?: HostDetection[];
};

export type DoctorOptions = {
  env?: NodeJS.ProcessEnv;
  userConfigDir?: string;
  repoHome?: string;
  homeDir?: string;
  detectHosts?: boolean;
};

export function wrapperPath(configDir: string): string {
  const unix = path.join(configDir, "bin", "mcp_jev");
  const win = path.join(configDir, "bin", "mcp_jev.cmd");
  if (fs.existsSync(unix)) {
    return unix;
  }
  if (fs.existsSync(win)) {
    return win;
  }
  return process.platform === "win32" ? win : unix;
}

export function resolveRepoHome(configDir: string, env: NodeJS.ProcessEnv = process.env): string {
  return readHomeRecord(configDir) ?? defaultRepoHome(env);
}

export function runDoctor(options: DoctorOptions = {}): DoctorReport {
  const env = options.env ?? process.env;
  const userConfigDir = options.userConfigDir ?? defaultUserConfigDir(env);
  const config = loadConfig(env, { userConfigDir });
  const repoHome = options.repoHome ?? resolveRepoHome(userConfigDir, env);
  const homeDir = options.homeDir ?? os.homedir();
  const wrapper = wrapperPath(userConfigDir);
  const distEntry = path.join(repoHome, "dist", "index.js");
  const packageJson = path.join(repoHome, "package.json");

  const checks: DoctorCheck[] = [];

  checks.push(checkoutCheck(packageJson, repoHome));
  checks.push({
    id: "dist",
    ok: fs.existsSync(distEntry),
    required: true,
    message: fs.existsSync(distEntry)
      ? `build present (${distEntry})`
      : `missing ${distEntry} — run npm run build or scripts/update.sh`,
  });
  checks.push(wrapperCheck(wrapper));
  checks.push({
    id: "api_key",
    ok: config.apiKeySet,
    required: true,
    message: config.apiKeySet
      ? `key present (boolean only; source=${config.apiKeySource})`
      : `no TypeSafe key in ${userEnvPath(userConfigDir)} or process env — run mcp_jev config set-key`,
  });
  const notReady = hasNotReadyMarker(userConfigDir);
  checks.push({
    id: "not_ready_marker",
    ok: !notReady,
    required: true,
    message: notReady
      ? `${path.join(userConfigDir, "NOT_READY")} present — install was not ready (missing key)`
      : "no NOT_READY marker",
  });

  const requiredFailed = checks.some((check) => check.required && !check.ok);
  const report: DoctorReport = {
    ok: !requiredFailed,
    ready: !requiredFailed && config.apiKeySet && !notReady,
    server: SERVER_NAME,
    server_version: SERVER_VERSION,
    user_config_dir: userConfigDir,
    repo_home: repoHome,
    api_key_set: config.apiKeySet,
    api_key_source: config.apiKeySource,
    checks,
  };
  if (options.detectHosts !== false) {
    report.hosts = detectHosts(homeDir);
  }
  return report;
}

function checkoutCheck(packageJson: string, repoHome: string): DoctorCheck {
  if (!fs.existsSync(packageJson)) {
    return {
      id: "checkout",
      ok: false,
      required: true,
      message: `missing checkout at ${repoHome} (no package.json)`,
    };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJson, "utf8")) as { name?: string };
    if (pkg.name !== "mcp_jev") {
      return {
        id: "checkout",
        ok: false,
        required: true,
        message: `${packageJson} name is "${pkg.name ?? ""}", expected mcp_jev`,
      };
    }
  } catch {
    return {
      id: "checkout",
      ok: false,
      required: true,
      message: `could not parse ${packageJson}`,
    };
  }
  return {
    id: "checkout",
    ok: true,
    required: true,
    message: `checkout ok (${repoHome})`,
  };
}

function wrapperCheck(wrapper: string): DoctorCheck {
  if (!fs.existsSync(wrapper)) {
    return {
      id: "wrapper",
      ok: false,
      required: true,
      message: `missing wrapper ${wrapper} — run scripts/install.sh`,
    };
  }
  return {
    id: "wrapper",
    ok: true,
    required: true,
    message: `wrapper present (${wrapper})`,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    `mcp_jev doctor ${report.ready ? "READY" : "NOT READY"}`,
    `server ${report.server} ${report.server_version}`,
    `config ${report.user_config_dir}`,
    `repo   ${report.repo_home}`,
    `api_key_set ${report.api_key_set} (source=${report.api_key_source})`,
    "",
  ];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "ok" : "FAIL"}  ${check.id}: ${check.message}`);
  }
  if (report.hosts) {
    lines.push("");
    lines.push("hosts (informational; missing config is not a failure)");
    for (const host of report.hosts) {
      const state = host.registered
        ? "registered"
        : host.config_exists
          ? "config present, mcp_jev not registered"
          : "no config file";
      lines.push(`- ${host.id}: ${state}`);
    }
  }
  lines.push("");
  lines.push("Never prints the TypeSafe key.");
  return `${lines.join("\n")}\n`;
}
