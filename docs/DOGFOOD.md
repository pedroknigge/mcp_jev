# Blind-test protocol

Use this when dogfooding mcp_jev **without** shopping the pack menu first. Production still treats packs as shortcuts. Blind tests prove **`run_questions` is first-class** (same `systemOne` path as `run_pack`).

## Protocol

1. **Invent typed questions first.** Write a closed, small `state` object and 1–3 Choice / Noul / Score questions. Do **not** open `list_packs`, the skill pack table, or [`references/pack-catalog.md`](../skills/mcp_jev/references/pack-catalog.md) yet.
2. **Then** `list_packs` (and `describe_pack` only if an id looks identical).
3. **Use a pack only if it matches exactly** — same state shape and the same question heads (ids + types + closed option catalogs). Then `run_pack`.
4. **Otherwise `run_questions`.** Do not stop. Do not invent `ask_jev`. Do not stretch a nearby pack.

Copy-paste i18n body (equal prominence to `run_pack` `i18n_copy`): [CUSTOM_JUDGMENTS.md](CUSTOM_JUDGMENTS.md#recipe-i18n-via-run_questions) · skill recipe `run_questions` · `scripts/blind-i18n-example.mjs`.

```bash
node --import tsx scripts/blind-i18n-example.mjs          # mocked systemOne (CI)
node --import tsx scripts/blind-i18n-example.mjs --live   # TypeSafeClient.systemOne
```

`--live` is skipped in CI unless `TYPESAFE_API_KEY` is set and `SMOKE_LIVE=1`.

## Exact match (i18n)

`i18n_copy` matches **only** if you invented exactly: Nouls `has_user_facing_hardcoded_copy` / `should_migrate_to_i18n` / `already_partially_internationalized`, Score `i18n_debt`, Choice `hottest_candidate` over `candidates[].id` plus `none`, Choice `primary_bucket`. An extra head (recipe: `needs_locale_split`) or a different catalog → **`run_questions`**.

## Harness pointers (X / ecosystem)

These loops stay in the **caller**. Jev only returns Choice / Noul / Score.

| Loop | Blind first | Pack only if exact |
| --- | --- | --- |
| GUI next click/type from a closed catalog | Invent `operation` + per-op target Choices over **your** ids; Noul `goal_achieved`; Score `step_confidence` | `computer_use_step`: cap `items[]` in the harness **before 255** (Choice cap includes `none`). Prefer `source: "dom"` when ids are DOM-closed (`ax` / `ocr` when that is what you observed). After `run_pack`, act only on `guidance.effective_targets` / `guidance.target_for[operation]`. Writer LLM owns `type_text` / `type_email` (`guidance.writer_owns_typed_string`). No screenshots in state. |
| Per-turn cheap vs strong | Invent Choice `route` over **your** lanes plus refuse; Nouls for tools/irreversible as needed; Score `difficulty` | `model_router` **only if** heads match exactly (`fast_local` \| `strong_reasoner` \| `tools_heavy` \| `ask_user` \| `skip` + pack Nouls). Custom lane ids (e.g. `cheap_local` / `tools_cascade`) or different Nouls (`needs_shell_tools`, `irreversible_side_effect`) → **`run_questions`** ([CUSTOM_JUDGMENTS.md](CUSTOM_JUDGMENTS.md#recipe-model-route-via-run_questions)). Call at **turn start**, map `route.choice` in **code**. Do not invent a sixth **pack** lane. |

More custom recipes: [CUSTOM_JUDGMENTS.md](CUSTOM_JUDGMENTS.md). Pack catalog: [`references/pack-catalog.md`](../skills/mcp_jev/references/pack-catalog.md).

## Bi-hourly dogfood notes

Standing checks when dogfooding this repo (mcp_jev is the template for Pedro skills):

1. **Version prefix required.** `skills/mcp_jev/SKILL.md` frontmatter `description` always `VERSION — …` (must start with `${package.json version} — `, em dash). Example: `0.0.9 — Install, update, and call…`. `npx tsx scripts/sync-skill-catalog.ts --check` / `npm test` fail if it drifts.
2. **One skill refresh path.** After `scripts/update.sh` / `install.sh`, the skill is refreshed **once** to `~/.agents/skills/mcp_jev` (`scripts/refresh-skill.sh`; replaces that folder; never nests `mcp_jev/mcp_jev`). Do **not** also run `npx skills add` or `cp` in the same pass. Hosts that do not read `~/.agents/skills` re-add **once** with `npx skills add pedroknigge/mcp_jev --skill mcp_jev`.
