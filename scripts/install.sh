#!/usr/bin/env bash
# One-shot install: clone or pull, build, store the TypeSafe key once, print host JSON.
set -euo pipefail

REPO_URL="${MCP_JEV_REPO:-https://github.com/pedroknigge/mcp_jev.git}"
CONFIG_DIR="${MCP_JEV_CONFIG:-$HOME/.mcp_jev}"

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR=""
fi

if [[ -n "${MCP_JEV_HOME:-}" ]]; then
  REPO_HOME="$MCP_JEV_HOME"
elif [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/../package.json" ]] && grep -q '"name": "mcp_jev"' "$SCRIPT_DIR/../package.json"; then
  REPO_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  REPO_HOME="$HOME/mcp_jev"
fi

say() { printf '%s\n' "$*"; }
die() { printf 'mcp_jev install: %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing '$1'. Install Node 20+ and git, then retry."
}

need git
need node
need npm

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  die "Node 20+ required (found $(node -v))."
fi

say "Repo:    $REPO_HOME"
say "Config:  $CONFIG_DIR"
say "Source:  $REPO_URL"

if [[ -d "$REPO_HOME/.git" ]]; then
  say "Updating existing clone…"
  git -C "$REPO_HOME" pull --ff-only
elif [[ -d "$REPO_HOME" && -f "$REPO_HOME/package.json" ]]; then
  say "Using existing directory (not a git clone)."
else
  if [[ -e "$REPO_HOME" && ! -d "$REPO_HOME" ]]; then
    die "$REPO_HOME exists and is not a directory"
  fi
  say "Cloning…"
  git clone "$REPO_URL" "$REPO_HOME"
fi

say "npm install && npm run build"
(
  cd "$REPO_HOME"
  npm install
  npm run build
)

mkdir -p "$CONFIG_DIR/bin"
printf '%s\n' "$REPO_HOME" > "$CONFIG_DIR/home"
chmod 700 "$CONFIG_DIR" 2>/dev/null || true

WRAPPER="$CONFIG_DIR/bin/mcp_jev"
cat > "$WRAPPER" <<'WRAP'
#!/usr/bin/env bash
set -euo pipefail
CONFIG_DIR="${MCP_JEV_CONFIG:-$HOME/.mcp_jev}"
REPO="${MCP_JEV_HOME:-}"
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

ENV_FILE="$CONFIG_DIR/.env"
if [[ -n "${TYPESAFE_API_KEY:-}" ]]; then
  node "$REPO_HOME/dist/index.js" config set-key "$TYPESAFE_API_KEY"
elif [[ -f "$ENV_FILE" ]] && grep -q '^TYPESAFE_API_KEY=.\+' "$ENV_FILE"; then
  say "Keeping existing key in $ENV_FILE"
else
  say ""
  say "Set your TypeSafe key ONCE (https://console.typesafe.ai). Host mcp.json stays keyless."
  if [[ -t 0 ]]; then
    node "$REPO_HOME/dist/index.js" config set-key
  else
    say "Non-interactive: re-run with TYPESAFE_API_KEY=… or:"
    say "  node \"$REPO_HOME/dist/index.js\" config set-key"
  fi
fi

CURSOR_JSON=$(cat <<EOF
{
  "mcpServers": {
    "mcp_jev": {
      "command": "$WRAPPER"
    }
  }
}
EOF
)

CLAUDE_JSON="$CURSOR_JSON"

say ""
say "=== Cursor  (~/.cursor/mcp.json or .cursor/mcp.json) ==="
say "$CURSOR_JSON"
say ""
say "=== Claude Desktop  (claude_desktop_config.json) ==="
say "$CLAUDE_JSON"
say ""
say "Same JSON works for most hosts. Codex/Grok use TOML:"
say "[mcp_servers.mcp_jev]"
say "command = \"$WRAPPER\""
say ""
say "Then: restart the MCP host → ping → list_packs"
say "Update later:  $REPO_HOME/scripts/update.sh"
say "Skill: npx skills add pedroknigge/mcp_jev --skill mcp_jev"
say "Docs: https://github.com/pedroknigge/mcp_jev"
say "Do not put the key in chat or in mcp.json."

if command -v pbcopy >/dev/null 2>&1; then
  printf '%s\n' "$CURSOR_JSON" | pbcopy && say "Copied Cursor JSON to the clipboard (pbcopy)."
elif command -v wl-copy >/dev/null 2>&1; then
  printf '%s\n' "$CURSOR_JSON" | wl-copy && say "Copied Cursor JSON to the clipboard (wl-copy)."
elif command -v xclip >/dev/null 2>&1; then
  printf '%s\n' "$CURSOR_JSON" | xclip -selection clipboard && say "Copied Cursor JSON to the clipboard (xclip)."
fi
