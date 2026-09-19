import fs from "node:fs";
import path from "node:path";

import { defaultUserConfigDir } from "./user-config.js";

export const NOT_READY_NAME = "NOT_READY";

export const NOT_READY_BODY = `NOT_READY

mcp_jev finished the checkout and wrapper, but no TypeSafe key is stored.
Host configs must stay keyless. Do not paste TYPESAFE_API_KEY into chat or mcp.json.

Next step:
  mcp_jev config set-key
  # or: TYPESAFE_API_KEY=… mcp_jev config set-key YOUR_KEY

Then:
  mcp_jev doctor
  mcp_jev ping   # via the MCP host, or scripts/verify-mcp.sh for stdio smoke
`;

export function notReadyPath(dir: string = defaultUserConfigDir()): string {
  return path.join(dir, NOT_READY_NAME);
}

export function hasNotReadyMarker(dir: string = defaultUserConfigDir()): boolean {
  return fs.existsSync(notReadyPath(dir));
}

export function writeNotReadyMarker(dir: string = defaultUserConfigDir()): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = notReadyPath(dir);
  fs.writeFileSync(file, NOT_READY_BODY, { encoding: "utf8", mode: 0o644 });
  return file;
}

export function clearNotReadyMarker(dir: string = defaultUserConfigDir()): void {
  const file = notReadyPath(dir);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}
