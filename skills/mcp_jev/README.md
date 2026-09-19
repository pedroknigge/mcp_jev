# mcp_jev skill

Agent skill for the local **mcp_jev** MCP server (TypeSafe Jev / System One packs).

- Full instructions: [`SKILL.md`](./SKILL.md)
- Server README: [`../../README.md`](../../README.md)

## Install

**Copy into the project** (works in Cursor and most agents):

```bash
mkdir -p .cursor/skills
cp -R skills/mcp_jev .cursor/skills/mcp_jev
```

Or copy `skills/mcp_jev` into your agent's skills directory (`~/.cursor/skills`, `.claude/skills`, etc.).

**skills.sh style** (when this repo is the skill source):

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
```

Project-local by default; add `-g` to install globally if your skills CLI supports it.

This skill is **not** the official TypeSafe skill. That one teaches you to design questions and write SDK code:

```bash
npx skills add typesafe-ai/skills --skill typesafe-ai
```
