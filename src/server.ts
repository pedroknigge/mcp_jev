import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "./config.js";
import { toFriendlyError } from "./errors.js";
import { handleDescribePack, handleListPacks, handlePing, handleRunPack } from "./handlers.js";
import { createSystemOne, type SystemOneCall } from "./typesafe.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

export type ServerDeps = {
  config: AppConfig;
  systemOne?: SystemOneCall;
};

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(err: unknown) {
  const friendly = toFriendlyError(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(friendly, null, 2) }],
  };
}

export function createServer(deps: ServerDeps): McpServer {
  const systemOne = deps.systemOne ?? createSystemOne(deps.config);
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_packs",
    {
      title: "List Jev packs",
      description:
        "List the closed catalog of TypeSafe Jev packs. Returns id, title, summary, and when_to_use. There is no free-form ask tool.",
    },
    async () => jsonResult(handleListPacks()),
  );

  server.registerTool(
    "describe_pack",
    {
      title: "Describe a Jev pack",
      description:
        "Return a pack's JSON Schema state, Choice/Noul/Score questions, example state, and suggested agent workflow. Always describe before run_pack when the schema is unfamiliar.",
      inputSchema: {
        pack_id: z.string().min(1).describe("Pack id from list_packs, e.g. pr_audit"),
      },
    },
    async ({ pack_id }) => {
      try {
        return jsonResult(handleDescribePack(pack_id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "run_pack",
    {
      title: "Run a Jev pack",
      description:
        "Validate state and call TypeSafe System One (Jev) for that pack only. Returns typed answers (choice/noul/score), probabilities/confidence where the API provides them, and usage. Requires TYPESAFE_API_KEY. Does not run side effects.",
      inputSchema: {
        pack_id: z.string().min(1).describe("Pack id from list_packs"),
        state: z
          .record(z.unknown())
          .describe("State object matching the pack's JSON Schema from describe_pack"),
      },
    },
    async ({ pack_id, state }) => {
      try {
        return jsonResult(await handleRunPack({ pack_id, state }, { config: deps.config, systemOne }));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "ping",
    {
      title: "Health check",
      description:
        "Health: server version, TypeSafe JS SDK version, pack count, whether TYPESAFE_API_KEY is set. Never echoes the key.",
    },
    async () => jsonResult(handlePing(deps.config)),
  );

  return server;
}
