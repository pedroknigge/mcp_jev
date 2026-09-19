#!/usr/bin/env bash
# Load the one-time user store, then exec the stdio MCP server.
# Do not print anything to stdout — that breaks MCP.
set -euo pipefail

CONFIG_DIR="${MCP_JEV_HOME:-${MCP_JEV_CONFIG:-$HOME/.mcp_jev}}"
REPO="${MCP_JEV_CHECKOUT:-}"

if [[ -z "$REPO" && -f "$CONFIG_DIR/home" ]]; then
  REPO="$(tr -d '\r\n' < "$CONFIG_DIR/home")"
fi

if [[ -z "$REPO" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$SCRIPT_DIR/../dist/index.js" ]]; then
    REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
  else
    REPO="$HOME/mcp_jev"
  fi
fi

if [[ -f "$CONFIG_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$CONFIG_DIR/.env"
  set +a
fi

ENTRY="$REPO/dist/index.js"
if [[ ! -f "$ENTRY" ]]; then
  echo "mcp_jev: missing $ENTRY — run scripts/install.sh from https://github.com/pedroknigge/mcp_jev" >&2
  exit 1
fi

exec node "$ENTRY" "$@"
