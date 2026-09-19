import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const SERVER_NAME = "mcp_jev";
export const SERVER_VERSION = (require("../package.json") as { version: string }).version;
