#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { runCli } from "./cli.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length > 0) {
    await runCli(argv);
    return;
  }

  const config = loadConfig();
  const server = createServer({ config });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`mcp_jev failed to start: ${message}`);
  process.exit(1);
});
