#!/usr/bin/env bash
# One-shot install: clone or pull, build, store the TypeSafe key once, print host snippets.
set -euo pipefail

REPO_URL="${MCP_JEV_REPO:-https://github.com/pedroknigge/mcp_jev.git}"
# MCP_JEV_HOME = user config dir (key + wrapper). Default ~/.mcp_jev
CONFIG_DIR="${MCP_JEV_HOME:-${MCP_JEV_CONFIG:-$HOME/.mcp_jev}}"

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR=""
fi

if [[ -n "${MCP_JEV_CHECKOUT:-}" ]]; then
  REPO_HOME="$MCP_JEV_CHECKOUT"
elif [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/../package.json" ]] && grep -q '"name": "mcp_jev"' "$SCRIPT_DIR/../package.json"; then
  REPO_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [[ -f "$CONFIG_DIR/home" ]]; then
  REPO_HOME="$(tr -d '\r\n' < "$CONFIG_DIR/home")"
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

if [[ -z "${MCP_JEV_INSTALL_SKIP_GIT:-}" ]]; then
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
else
  say "Skipping git (MCP_JEV_INSTALL_SKIP_GIT=1)."
  [[ -f "$REPO_HOME/package.json" ]] || die "MCP_JEV_INSTALL_SKIP_GIT set but $REPO_HOME/package.json is missing"
fi

if [[ -z "${MCP_JEV_INSTALL_SKIP_BUILD:-}" ]]; then
  say "npm install && npm run build"
  (
    cd "$REPO_HOME"
    npm install
    npm run build
  )
else
  say "Skipping npm install/build (MCP_JEV_INSTALL_SKIP_BUILD=1)."
fi

mkdir -p "$CONFIG_DIR/bin"
printf '%s\n' "$REPO_HOME" > "$CONFIG_DIR/home"
chmod 700 "$CONFIG_DIR" 2>/dev/null || true

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

ENV_FILE="$CONFIG_DIR/.env"
READY=1
if [[ -n "${TYPESAFE_API_KEY:-}" ]]; then
  MCP_JEV_HOME="$CONFIG_DIR" node "$REPO_HOME/dist/index.js" config set-key "$TYPESAFE_API_KEY"
  rm -f "$CONFIG_DIR/NOT_READY"
elif [[ -f "$ENV_FILE" ]] && grep -q '^TYPESAFE_API_KEY=.\+' "$ENV_FILE"; then
  say "Keeping existing key in $ENV_FILE"
  rm -f "$CONFIG_DIR/NOT_READY"
else
  say ""
  say "Set your TypeSafe key ONCE (https://console.typesafe.ai). Any agent that attaches this MCP reuses it."
  say "Host mcp.json stays keyless."
  if [[ -t 0 ]]; then
    MCP_JEV_HOME="$CONFIG_DIR" node "$REPO_HOME/dist/index.js" config set-key
    rm -f "$CONFIG_DIR/NOT_READY"
  else
    READY=0
    cat > "$CONFIG_DIR/NOT_READY" <<EOF
NOT_READY

mcp_jev finished the checkout and wrapper, but no TypeSafe key is stored.
Host configs must stay keyless. Do not paste TYPESAFE_API_KEY into chat or mcp.json.

Next step:
  MCP_JEV_HOME="$CONFIG_DIR" node "$REPO_HOME/dist/index.js" config set-key

Then:
  MCP_JEV_HOME="$CONFIG_DIR" node "$REPO_HOME/dist/index.js" doctor
EOF
    say ""
    say "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    say "NOT_READY: non-interactive install without a TypeSafe key."
    say "Wrote $CONFIG_DIR/NOT_READY"
    say "Next: MCP_JEV_HOME=\"$CONFIG_DIR\" node \"$REPO_HOME/dist/index.js\" config set-key"
    say "Then: mcp_jev doctor"
    say "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  fi
fi

CLI=(env "MCP_JEV_HOME=$CONFIG_DIR" node "$REPO_HOME/dist/index.js")

say ""
if [[ -f "$REPO_HOME/dist/index.js" ]]; then
  "${CLI[@]}" hosts print || true
else
  say "=== Cursor  (~/.cursor/mcp.json) ==="
  say "{ \"mcpServers\": { \"mcp_jev\": { \"command\": \"$WRAPPER\" } } }"
fi

if [[ -n "${MCP_JEV_WRITE_HOSTS:-}" ]]; then
  say ""
  say "Writing keyless host snippets (MCP_JEV_WRITE_HOSTS=${MCP_JEV_WRITE_HOSTS})…"
  "${CLI[@]}" hosts write "$MCP_JEV_WRITE_HOSTS" || true
elif [[ -t 0 ]]; then
  say ""
  printf 'Write keyless snippets into detected host configs? [y/N] '
  read -r ANSWER || ANSWER=""
  if [[ "$ANSWER" =~ ^[Yy] ]]; then
    "${CLI[@]}" hosts write all || true
  else
    say "Skipped host writes. Merge the printed snippets yourself."
  fi
else
  say ""
  say "Non-interactive: host files were not modified."
  say "Merge the snippets above, or re-run with MCP_JEV_WRITE_HOSTS=all (or cursor,claude_desktop,claude_code,codex,grok,antigravity)."
fi

if [[ "${MCP_JEV_SYNC_SKILL:-}" == "1" ]]; then
  SKILL_SRC="$REPO_HOME/skills/mcp_jev"
  if [[ -d "$SKILL_SRC" && -d "$REPO_HOME/.cursor/skills" ]]; then
    rm -rf "$REPO_HOME/.cursor/skills/mcp_jev"
    cp -R "$SKILL_SRC" "$REPO_HOME/.cursor/skills/mcp_jev"
    say "Synced skill → $REPO_HOME/.cursor/skills/mcp_jev"
  elif [[ -d "$SKILL_SRC" && -d "${HOME}/.cursor/skills" ]]; then
    rm -rf "${HOME}/.cursor/skills/mcp_jev"
    cp -R "$SKILL_SRC" "${HOME}/.cursor/skills/mcp_jev"
    say "Synced skill → ${HOME}/.cursor/skills/mcp_jev"
  else
    say "MCP_JEV_SYNC_SKILL=1 but no .cursor/skills at $REPO_HOME or \$HOME — skipped copy."
  fi
fi

say ""
say "Then: mcp_jev doctor → restart the MCP host → ping → list_packs"
say "Smoke (no TypeSafe call): $REPO_HOME/scripts/verify-mcp.sh"
say "Update later (GitHub checkout, not npm):  $REPO_HOME/scripts/update.sh"
say ""
say "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
say "SKILL REFRESH — hosts do not auto-reload skills after pull."
say "Agents: re-load the skill from this checkout, or re-add it."
say ""
say "  npx skills add pedroknigge/mcp_jev --skill mcp_jev"
say ""
say "  # or copy (do not write into random projects):"
say "  cp -R \"$REPO_HOME/skills/mcp_jev\" .cursor/skills/mcp_jev"
say "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
say "Docs: https://github.com/pedroknigge/mcp_jev"
say "Do not put the key in chat or in mcp.json."

if command -v pbcopy >/dev/null 2>&1; then
  printf '%s\n' "{ \"mcpServers\": { \"mcp_jev\": { \"command\": \"$WRAPPER\" } } }" | pbcopy && say "Copied Cursor JSON to the clipboard (pbcopy)."
elif command -v wl-copy >/dev/null 2>&1; then
  printf '%s\n' "{ \"mcpServers\": { \"mcp_jev\": { \"command\": \"$WRAPPER\" } } }" | wl-copy && say "Copied Cursor JSON to the clipboard (wl-copy)."
elif command -v xclip >/dev/null 2>&1; then
  printf '%s\n' "{ \"mcpServers\": { \"mcp_jev\": { \"command\": \"$WRAPPER\" } } }" | xclip -selection clipboard && say "Copied Cursor JSON to the clipboard (xclip)."
fi

if [[ "$READY" -eq 0 ]]; then
  exit 2
fi
