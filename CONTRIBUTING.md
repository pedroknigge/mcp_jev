# Contributing

mcp_jev is a small, local MCP server. Keep the surface closed: **no free-form `ask_jev` tool**. New work should be a better pack, a clearer error, or a more accurate doc — not another API wrapper.

Live TypeSafe docs are the source of truth for the API: [https://docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt). Do not invent request or response fields.

This repo is the source of truth for **how agents install and call** the four tools: [README.md](README.md), [scripts/install.sh](scripts/install.sh), [docs/INSTALL_AGENTS.md](docs/INSTALL_AGENTS.md), and [skills/mcp_jev/SKILL.md](skills/mcp_jev/SKILL.md). If you add a pack or a tool, update those. Keep `./scripts/install.sh` / `update.sh` as the happy path; do not require the TypeSafe key in every host `mcp.json`.

## Setup

```bash
npm install
cp .env.example .env   # optional; only needed to hit TypeSafe for real
npm run typecheck
npm test
npm run build
```

Do not commit `.env` or API keys.

## Adding a pack

1. Create `src/packs/<name>.ts` exporting a `PackDefinition`.
2. Register it in `src/packs/registry.ts`.
3. Bump the pack `version` on any question or schema change (`1.0.0` → `1.1.0` for compatible adds, `2.0.0` if state or question IDs break callers).

A pack must include:

| Field | Why |
| --- | --- |
| `id` | Stable snake_case key for `run_pack` |
| `version` | Callers cache describe output |
| `title`, `summary`, `when_to_use` | `list_packs` |
| `state_schema` | JSON Schema. Prefer named fields over a blob of prose |
| `example_state` | Valid against the schema |
| `questions` | Only Choice / Noul / Score. One snap judgment each |
| `suggested_workflow` | How an agent should collect state, run, then compose in code |
| `notes` | Caller-owned gates and side effects (see `pr_audit` / `code_gate`) |

Write questions the way TypeSafe asks: complete meaning in `instructions`, options in `criteria`, backtick paths into state (`title`, `message`). Question IDs are for code; they are not sent to Jev.

Use the JS helpers only through `questionsFor(pack, state)` — that is what `run_pack` sends to `client.systemOne({ state, questions, model })`.

If a Choice catalog is not known until `run_pack` (item ids, file paths), set `questionsForState(state)` and build `choice()` criteria as a `Record` of those ids. `describe_pack` still returns the static `questions` template plus `dynamic_choice_from_state: true`. The TypeSafe JS SDK accepts dynamic option keys; do not invent ids the caller did not pass.

Add a registry or handler test if the pack has a special contract (for example: a gate that Jev must **not** compute, or target options built from `items[]`).

## What not to add

- A tool that accepts arbitrary TypeSafe questions
- Dashboards, web apps, or hosted proxies
- Side effects (GitHub comments, merges, refunds). Those belong in the caller
- Fabricated TypeSafe endpoints or answer fields
- Secrets, sample keys, or recorded production payloads

## Pull requests

Keep diffs surgical. `npm test` and `npm run build` must pass. Say what you verified (mocked `systemOne`, registry load). Do not call TypeSafe in CI unless the maintainer has provided a secret.
