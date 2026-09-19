#!/usr/bin/env bash
# Refresh skills/mcp_jev ONCE into ~/.agents/skills/mcp_jev.
# Never runs `npx skills add` (that plus a copy nests mcp_jev/mcp_jev).
# Usage: refresh-skill.sh REPO_HOME
set -euo pipefail

REPO_HOME="${1:-}"
if [[ -z "$REPO_HOME" || ! -d "$REPO_HOME" ]]; then
  echo "usage: refresh-skill.sh REPO_HOME" >&2
  exit 1
fi

SKILL_SRC="$REPO_HOME/skills/mcp_jev"
# Unwrap a leftover nest in the checkout (skills/mcp_jev/mcp_jev).
if [[ -f "$SKILL_SRC/mcp_jev/SKILL.md" && ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "mcp_jev: unwrapping nested skill source $SKILL_SRC/mcp_jev"
  SKILL_SRC="$SKILL_SRC/mcp_jev"
fi

if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "mcp_jev: no skill at $SKILL_SRC — skip refresh"
  exit 0
fi

DEST="${MCP_JEV_SKILL_HOME:-$HOME/.agents/skills/mcp_jev}"
SRC_REAL="$(cd "$SKILL_SRC" && pwd)"

if [[ -d "$DEST" ]]; then
  DEST_REAL="$(cd "$DEST" && pwd)"
  if [[ "$DEST_REAL" == "$SRC_REAL" ]]; then
    echo "mcp_jev: skill dest is the checkout ($DEST_REAL) — skip (would nest)."
    exit 0
  fi
fi

case "$DEST" in
  "$SRC_REAL"|"$SRC_REAL"/*)
    echo "mcp_jev: refusing to copy into $DEST (inside skill source; nests mcp_jev/mcp_jev)" >&2
    exit 1
    ;;
esac

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R "$SKILL_SRC" "$DEST"

if [[ -e "$DEST/mcp_jev" ]]; then
  echo "mcp_jev: nested skill at $DEST/mcp_jev — abort" >&2
  exit 1
fi
if [[ ! -f "$DEST/SKILL.md" ]]; then
  echo "mcp_jev: refresh missing $DEST/SKILL.md" >&2
  exit 1
fi

echo "Skill refreshed once → $DEST"
