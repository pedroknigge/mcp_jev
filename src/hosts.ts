import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOST_IDS = [
  "cursor",
  "claude_desktop",
  "claude_code",
  "codex",
  "grok",
  "antigravity",
] as const;

export type HostId = (typeof HOST_IDS)[number];

export type HostFormat = "json" | "toml";

export type HostSpec = {
  id: HostId;
  title: string;
  format: HostFormat;
  paths: (homeDir: string) => string[];
  jsonRoot?: "mcpServers";
  tomlTable?: string;
};

export type HostSnippet = {
  id: HostId;
  title: string;
  format: HostFormat;
  paths: string[];
  body: string;
};

export type HostDetection = {
  id: HostId;
  title: string;
  format: HostFormat;
  config_exists: boolean;
  registered: boolean;
  paths_checked: string[];
  matched_path?: string;
};

const SPECS: HostSpec[] = [
  {
    id: "cursor",
    title: "Cursor",
    format: "json",
    paths: (home) => [path.join(home, ".cursor", "mcp.json")],
    jsonRoot: "mcpServers",
  },
  {
    id: "claude_desktop",
    title: "Claude Desktop",
    format: "json",
    paths: (home) => claudeDesktopPaths(home),
    jsonRoot: "mcpServers",
  },
  {
    id: "claude_code",
    title: "Claude Code",
    format: "json",
    paths: (home) => [path.join(home, ".claude.json"), path.join(home, ".claude", "settings.json")],
    jsonRoot: "mcpServers",
  },
  {
    id: "codex",
    title: "Codex",
    format: "toml",
    paths: (home) => [path.join(home, ".codex", "config.toml")],
    tomlTable: "mcp_servers.mcp_jev",
  },
  {
    id: "grok",
    title: "Grok",
    format: "toml",
    paths: (home) => [path.join(home, ".grok", "config.toml")],
    tomlTable: "mcp_servers.mcp_jev",
  },
  {
    id: "antigravity",
    title: "Antigravity",
    format: "json",
    paths: (home) => [
      path.join(home, ".gemini", "config", "mcp_config.json"),
      path.join(home, ".agents", "mcp_config.json"),
    ],
    jsonRoot: "mcpServers",
  },
];

export function hostSpecs(): readonly HostSpec[] {
  return SPECS;
}

export function parseHostIds(raw: string | undefined): HostId[] {
  if (!raw || raw.trim() === "" || raw.trim() === "all") {
    return [...HOST_IDS];
  }
  const ids: HostId[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const id = part.trim();
    if (!id) {
      continue;
    }
    if (!HOST_IDS.includes(id as HostId)) {
      throw new Error(`Unknown host "${id}". Known: ${HOST_IDS.join(", ")}, all`);
    }
    ids.push(id as HostId);
  }
  return ids;
}

export function wrapperCommand(wrapperPath: string): string {
  return wrapperPath;
}

export function jsonSnippet(command: string): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        mcp_jev: {
          command,
        },
      },
    },
    null,
    2,
  )}\n`;
}

export function tomlSnippet(command: string): string {
  return `[mcp_servers.mcp_jev]\ncommand = ${tomlString(command)}\n`;
}

export function hostSnippets(command: string, homeDir: string = os.homedir()): HostSnippet[] {
  return SPECS.map((spec) => ({
    id: spec.id,
    title: spec.title,
    format: spec.format,
    paths: spec.paths(homeDir),
    body: spec.format === "toml" ? tomlSnippet(command) : jsonSnippet(command),
  }));
}

export function formatHostSnippets(command: string, homeDir: string = os.homedir()): string {
  const lines = [
    "Keyless host snippets. command = the mcp_jev wrapper. Never put TYPESAFE_API_KEY here.",
    "",
  ];
  for (const snippet of hostSnippets(command, homeDir)) {
    lines.push(`=== ${snippet.title}  (${snippet.paths.join(" | ")}) ===`);
    lines.push(snippet.body.trimEnd());
    lines.push("");
  }
  return lines.join("\n");
}

export function detectHosts(homeDir: string = os.homedir()): HostDetection[] {
  return SPECS.map((spec) => {
    const paths_checked = spec.paths(homeDir);
    let config_exists = false;
    let registered = false;
    let matched_path: string | undefined;
    for (const file of paths_checked) {
      if (!fs.existsSync(file)) {
        continue;
      }
      config_exists = true;
      const text = fs.readFileSync(file, "utf8");
      if (fileMentionsMcpJev(text)) {
        registered = true;
        matched_path = file;
        break;
      }
      matched_path ??= file;
    }
    return {
      id: spec.id,
      title: spec.title,
      format: spec.format,
      config_exists,
      registered,
      paths_checked,
      matched_path,
    };
  });
}

export type WriteHostsResult = {
  written: string[];
  skipped: string[];
  errors: string[];
};

export function writeHostConfigs(
  command: string,
  ids: HostId[],
  homeDir: string = os.homedir(),
  options: { onlyIfPresent?: boolean } = {},
): WriteHostsResult {
  const written: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  const wanted = new Set(ids);

  for (const spec of SPECS) {
    if (!wanted.has(spec.id)) {
      continue;
    }
    const targets = spec.paths(homeDir);
    const existing = targets.find((file) => fs.existsSync(file));
    const target = existing ?? targets[0];
    if (!target) {
      continue;
    }
    if (options.onlyIfPresent && !existing) {
      skipped.push(`${spec.id}: no config file yet`);
      continue;
    }
    try {
      if (existing && fileMentionsMcpJev(fs.readFileSync(existing, "utf8"))) {
        skipped.push(`${spec.id}: already registered in ${existing}`);
        continue;
      }
      if (spec.format === "toml") {
        mergeToml(target, command);
      } else {
        mergeJson(target, command);
      }
      written.push(`${spec.id}: ${target}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${spec.id}: ${message}`);
    }
  }

  return { written, skipped, errors };
}

function claudeDesktopPaths(home: string): string[] {
  if (process.platform === "darwin") {
    return [path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")];
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return [path.join(appData, "Claude", "claude_desktop_config.json")];
  }
  return [path.join(home, ".config", "Claude", "claude_desktop_config.json")];
}

function fileMentionsMcpJev(text: string): boolean {
  return /mcp_jev/.test(text);
}

function mergeJson(file: string, command: string): void {
  let current: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, "utf8").trim();
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`refusing to merge ${file}: root is not an object`);
      }
      current = parsed as Record<string, unknown>;
    }
  }
  const root =
    current.mcpServers && typeof current.mcpServers === "object" && !Array.isArray(current.mcpServers)
      ? (current.mcpServers as Record<string, unknown>)
      : {};
  current.mcpServers = {
    ...root,
    mcp_jev: { command },
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, { encoding: "utf8" });
}

function mergeToml(file: string, command: string): void {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (/(?:^|\n)\[mcp_servers\.mcp_jev\]/.test(existing)) {
    return;
  }
  const block = `${existing && !existing.endsWith("\n") ? "\n" : ""}${existing ? "\n" : ""}${tomlSnippet(command)}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, existing + block, { encoding: "utf8" });
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
