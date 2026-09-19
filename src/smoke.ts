import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const SMOKE_TOOLS = ["describe_pack", "list_packs", "ping", "run_pack", "run_questions"] as const;

export const SMOKE_PACK_IDS = [
  "computer_use_step",
  "model_router",
  "review_diff",
  "code_audit",
  "skill_router",
  "command_risk",
] as const;

export type SmokeSpawn = {
  command: string;
  args: string[];
  cwd?: string;
};

export type SmokeResult = {
  ok: true;
  server: string;
  server_version: string;
  tools: string[];
  packs: string[];
  api_key_set: boolean;
};

export function defaultSmokeSpawn(): SmokeSpawn {
  const entry = process.argv[1];
  if (!entry) {
    throw new Error("cannot locate mcp_jev entry for smoke");
  }
  if (entry.endsWith(".ts")) {
    return { command: process.execPath, args: ["--import", "tsx", entry], cwd: process.cwd() };
  }
  return { command: process.execPath, args: [entry], cwd: process.cwd() };
}

function textPayload(content: Array<{ type: string; text?: string }>): unknown {
  const first = content[0];
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("smoke: expected a text tool result");
  }
  return JSON.parse(first.text);
}

export async function runSmoke(spawn: SmokeSpawn = defaultSmokeSpawn()): Promise<SmokeResult> {
  const transport = new StdioClientTransport({
    command: spawn.command,
    args: spawn.args,
    cwd: spawn.cwd,
    env: {
      ...getDefaultEnvironment(),
      TYPESAFE_API_KEY: "",
    },
  });
  const client = new Client({ name: "mcp_jev-smoke", version: "0.0.0" });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const tools = listed.tools.map((tool) => tool.name).sort();
    if (JSON.stringify(tools) !== JSON.stringify([...SMOKE_TOOLS])) {
      throw new Error(`smoke: tools/list mismatch: ${JSON.stringify(tools)}`);
    }

    const ping = await client.callTool({ name: "ping", arguments: {} });
    if (ping.isError) {
      throw new Error("smoke: ping failed");
    }
    const pingBody = textPayload(ping.content as Array<{ type: string; text?: string }>) as {
      server?: string;
      server_version?: string;
      api_key_set?: boolean;
    };
    const serializedPing = JSON.stringify(pingBody);
    if (pingBody.server !== "mcp_jev") {
      throw new Error(`smoke: unexpected server ${pingBody.server ?? ""}`);
    }
    if (typeof pingBody.api_key_set !== "boolean") {
      throw new Error("smoke: ping.api_key_set must be boolean");
    }
    if (serializedPing.includes("TYPESAFE_API_KEY") || /sk-[A-Za-z0-9]{8,}/.test(serializedPing)) {
      throw new Error("smoke: ping leaked a key-shaped value");
    }

    const packsCall = await client.callTool({ name: "list_packs", arguments: {} });
    if (packsCall.isError) {
      throw new Error("smoke: list_packs failed");
    }
    const packsBody = textPayload(packsCall.content as Array<{ type: string; text?: string }>) as {
      packs?: Array<{ id?: string }>;
    };
    const packs = (packsBody.packs ?? []).map((pack) => pack.id ?? "").filter(Boolean);
    for (const id of SMOKE_PACK_IDS) {
      if (!packs.includes(id)) {
        throw new Error(`smoke: list_packs missing ${id}: ${packs.join(", ")}`);
      }
    }

    return {
      ok: true,
      server: pingBody.server,
      server_version: pingBody.server_version ?? "",
      tools,
      packs,
      api_key_set: pingBody.api_key_set,
    };
  } finally {
    await client.close();
  }
}

export function formatSmokeResult(result: SmokeResult): string {
  return [
    "mcp_jev smoke: ok",
    `server: ${result.server} ${result.server_version}`.trim(),
    `tools: ${result.tools.join(", ")}`,
    `ping: api_key_set=${result.api_key_set} packs=${result.packs.length}`,
    `list_packs: ${result.packs.join(", ")}`,
    "No TypeSafe call.",
    "",
  ].join("\n");
}
