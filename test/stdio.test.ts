import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { packCount } from "../src/packs/index.js";
import { SMOKE_TOOLS } from "../src/smoke.js";

const root = fileURLToPath(new URL("..", import.meta.url));

test("stdio MCP exposes the closed tool catalog and answers ping", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/index.ts"],
    cwd: root,
    env: {
      ...getDefaultEnvironment(),
    },
  });
  const client = new Client({ name: "mcp_jev-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      [...SMOKE_TOOLS],
    );
    assert.ok(!listed.tools.some((tool) => tool.name.includes("ask")));

    const ping = await client.callTool({ name: "ping", arguments: {} });
    const text = ping.content[0];
    assert.ok(text && text.type === "text");
    const body = JSON.parse(text.text) as { server: string; api_key_set: boolean; packs: number };
    assert.equal(body.server, "mcp_jev");
    assert.equal(body.packs, packCount());
    assert.equal(typeof body.api_key_set, "boolean");
  } finally {
    await client.close();
  }
});
