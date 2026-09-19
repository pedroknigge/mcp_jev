---
name: mcp_jev
description: >
  Run closed TypeSafe Jev (System One) judgment packs through the local mcp_jev
  MCP server. Use when you need typed Choice / Noul / Score answers from a
  known pack (PR audit, intent router, locale country), not chat prose. Do not
  use for free-form questions, generated reviews, or side effects.
---

# mcp_jev — run Jev packs, do not chat

**Jev is not an LLM chat model.** TypeSafe System One (flagship model: Jev) takes **state + typed questions** and returns **Choice / Noul / Score** answers with probabilities (and confidence on Choice/Score). There is nothing to parse. This MCP **only runs versioned packs**. Side effects — merge gates, comments, refunds, DB writes — stay in your code or other tools.

Live docs (source of truth): [https://docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt)

## When to use what

| Need | Use |
| --- | --- |
| A judgment that already exists as a pack (`pr_audit`, `intent_router`, `locale_country`) | **mcp_jev** tools |
| Designing new TypeSafe questions, writing `@typesafe-ai/sdk` / `typesafe-sdk` code, reading cookbooks | Official **TypeSafe skill** (`npx skills add typesafe-ai/skills --skill typesafe-ai`) |
| Prose, explanations, patches, multi-step reasoning | A **plain LLM** (you) |
| Merge block, GitHub comment, catalogue write, refund | **Your code / other MCPs** after reading typed answers |

If the user wants a new question that is not in a pack, do **not** invent an `ask_jev` call. Say this server cannot do that. Offer to add a pack (see `CONTRIBUTING.md`) or use the TypeSafe skill + SDK directly.

## Required workflow

Always:

1. `list_packs` — pick an `id` from the closed catalog
2. `describe_pack` — read `state_schema`, questions, `example_state`, `suggested_workflow`, `notes`
3. Collect state in **code** (short, named fields). Do not dump huge diffs or secrets
4. `run_pack` with `{ pack_id, state }`
5. Compose gates and side effects **after** the tool returns

`ping` is health only: SDK version, pack count, `api_key_set`. It never echoes `TYPESAFE_API_KEY`.

Skip `describe_pack` only when you already have that pack's schema from earlier in the same session.

## Never

- Invent free-form questions or a tool named `ask_jev`
- Invent TypeSafe endpoints or answer fields. Real JS call: `client.systemOne({ state, questions, model? })` with helpers `choice`, `noul`, `score`. Env: `TYPESAFE_API_KEY`. Default model: `jev-latest`
- Treat Jev output as chat. Read `choice` / `noul` / `score`, plus `probabilities` and `confidence` when present
- Ask Jev for `code_gate` on `pr_audit`. The caller computes the gate from answers
- Put the API key in a prompt, log, or commit
- Retry a validation error by guessing extra state fields. Re-read `describe_pack`

## How to read answers

From TypeSafe docs (verify if anything looks stale):

| Type | Fields | Meaning |
| --- | --- | --- |
| Choice | `choice`, `probabilities`, `confidence` | Selected label; distribution; how peaked |
| Score | `score`, `legend`, `probabilities`, `confidence` | Position on your rubric (may be between levels) |
| Noul | `noul` | Probability of yes (0–1). **No** separate `confidence` |

A Noul near `0.5` is uncertainty, not “medium intensity”. Low Choice/Score `confidence` means a spread distribution — escalate instead of acting.

## Starter packs

- **`pr_audit`** — merge_risk (`safe_ui` \| `needs_review` \| `block`), Nouls `money` / `hours` / `hours_money_boundary` / `migration`, Score `blast_radius`. **`code_gate` is yours.**
- **`intent_router`** — closed intent catalog + jailbreak/policy Nouls + urgency Score. Route in code; do not generate the user reply here.
- **`locale_country`** — Argentina \| USA \| India \| Uruguay \| Saudi Arabia (plus `unclear`) from catalogue name/description.

## Cursor MCP config

User-level or project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "npx",
      "args": ["-y", "mcp_jev"],
      "env": {
        "TYPESAFE_API_KEY": "<key from https://console.typesafe.ai>"
      }
    }
  }
}
```

Local checkout:

```json
{
  "mcpServers": {
    "mcp_jev": {
      "command": "node",
      "args": ["/absolute/path/to/mcp_jev/dist/index.js"],
      "env": {
        "TYPESAFE_API_KEY": "<key>"
      }
    }
  }
}
```

Optional env: `TYPESAFE_BASE_URL`, `JEV_MODEL` (default `jev-latest`).

If `run_pack` returns `missing_api_key`, stop and tell the user to set the key. Do not fabricate answers.

## Install this skill

Copy `skills/mcp_jev` into the agent's skills directory, or:

```bash
npx skills add pedroknigge/mcp_jev --skill mcp_jev
```
