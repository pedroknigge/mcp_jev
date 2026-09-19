# mcp_jev skill

Model-universal agent skill for the local **mcp_jev** MCP server (TypeSafe Jev / System One packs).

- Instructions (any model): [`SKILL.md`](./SKILL.md)
- Host copy-paste configs: [`references/install.md`](./references/install.md)
- Server README: [`../../README.md`](../../README.md)
- Deep dive: [`../../docs/INSTALL_AGENTS.md`](../../docs/INSTALL_AGENTS.md)

## Install the skill

**Copy into the project** (Cursor and most agents):

```bash
mkdir -p .cursor/skills
cp -R skills/mcp_jev .cursor/skills/mcp_jev
```

Claude Code / Desktop-adjacent:

```bash
mkdir -p .claude/skills
cp -R skills/mcp_jev .claude/skills/mcp_jev
```

Or copy `skills/mcp_jev` into the host's user skills directory (`~/.cursor/skills`, `~/.claude/skills`, `~/.codex/skills`, …).

**skills.sh style** (when this repo is the skill source):

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
```

Project-local by default; add `-g` to install globally if your skills CLI supports it.

This skill is **not** the official TypeSafe skill. That one teaches you to design questions and write SDK code:

```bash
npx skills add typesafe-ai/skills --skill typesafe-ai
```

## Install the MCP server

The skill does not start Jev. Register the stdio server in the host (absolute `node $REPO_PATH/dist/index.js`, plus `TYPESAFE_API_KEY` in `env`). See `SKILL.md` and `references/install.md`.
