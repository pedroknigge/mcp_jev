#!/usr/bin/env bash
# One-shot update: git pull + npm install + build. Preserves ~/.mcp_jev/.env.
set -euo pipefail

CONFIG_DIR="${MCP_JEV_HOME:-${MCP_JEV_CONFIG:-$HOME/.mcp_jev}}"

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR=""
fi

if [[ -n "${MCP_JEV_CHECKOUT:-}" ]]; then
  REPO_HOME="$MCP_JEV_CHECKOUT"
elif [[ -f "$CONFIG_DIR/home" ]]; then
  REPO_HOME="$(tr -d '\r\n' < "$CONFIG_DIR/home")"
elif [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/../package.json" ]]; then
  REPO_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  REPO_HOME="$HOME/mcp_jev"
fi

[[ -d "$REPO_HOME" ]] || {
  echo "mcp_jev update: no checkout at $REPO_HOME — run scripts/install.sh from https://github.com/pedroknigge/mcp_jev" >&2
  exit 1
}

echo "Updating $REPO_HOME"
echo "Key store $CONFIG_DIR/.env is not touched."

if [[ -d "$REPO_HOME/.git" ]]; then
  git -C "$REPO_HOME" pull --ff-only
fi
(
  cd "$REPO_HOME"
  npm install
  npm run build
)

mkdir -p "$CONFIG_DIR/bin"
printf '%s\n' "$REPO_HOME" > "$CONFIG_DIR/home"
WRAPPER="$CONFIG_DIR/bin/mcp_jev"
cat > "$WRAPPER" <<'WRAP'
#!/usr/bin/env bash
set -euo pipefail
CONFIG_DIR="${MCP_JEV_HOME:-${MCP_JEV_CONFIG:-$HOME/.mcp_jev}}"
REPO="${MCP_JEV_CHECKOUT:-}"
if [[ -z "$REPO" && -f "$CONFIG_DIR/home" ]]; then
  REPO="$(tr -d '\r\n' < "$CONFIG_DIR/home")"
fi
REPO="${REPO:-$HOME/mcp_jev}"
if [[ -f "$CONFIG_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$CONFIG_DIR/.env"
  set +a
fi
ENTRY="$REPO/dist/index.js"
if [[ ! -f "$ENTRY" ]]; then
  echo "mcp_jev: missing $ENTRY — run scripts/update.sh" >&2
  exit 1
fi
exec node "$ENTRY" "$@"
WRAP
chmod 755 "$WRAPPER"

if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/refresh-skill.sh" ]]; then
  bash "$SCRIPT_DIR/refresh-skill.sh" "$REPO_HOME"
fi

echo "Done. Restart your MCP host, then ping → list_packs."
echo ""
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo "SKILL REFRESH — one path only (already ran): ~/.agents/skills/mcp_jev"
echo "Do not also copy the skill folder (nests mcp_jev/mcp_jev)."
echo "Hosts that ignore ~/.agents/skills: re-add once after update:"
echo ""
echo "  npx skills add pedroknigge/mcp_jev --skill mcp_jev"
echo ""
echo "Description always starts with VERSION — (package.json)."
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo "Docs: https://github.com/pedroknigge/mcp_jev"
