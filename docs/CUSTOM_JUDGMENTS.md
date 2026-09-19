# Custom judgments (`run_questions`)

**Packs are shortcuts.** Load this only when **no pack fits**.

This is **not** chat and **not** essay generation. Same System One path as `run_pack`: caller-built **state** + typed **Choice / Noul / Score** questions. No side effects.

Hardcoded UI copy is already a shortcut: use **`i18n_copy`** (`run_pack`), not this tool. That pack is what happens when a custom pattern repeats and gets upstreamed.

## Workflow

1. `list_packs`. If an id fits → `describe_pack` + `run_pack` (the shortcut).
2. If **no pack fits**: do **not** stop. Do **not** invent `ask_jev`.
3. Build a **closed, small** state object (named evidence — not a repo dump).
4. Ask only typed questions. Call **`run_questions`**.
5. Compose gates in **your** code.
6. After the same custom pattern repeats 2–3 times, upstream a named pack (`CONTRIBUTING.md`).

## Question types

| type | criteria | Notes |
| --- | --- | --- |
| `choice` | `Record<string, string>` | Closed options, 2–255. Include a refuse key (`none` / `unclear`) if the catalog might not fit. |
| `noul` | `{ true?: string, false?: string }` | Optional; defaults are fine. P(yes) in 0–1. |
| `score` | `string[]` | Ordered levels, at least 2. |

Each question: `{ id, type, instructions, criteria }`. `id` is a snake_case key for code. Put complete meaning in `instructions`; backtick paths into state.

Optional `model` overrides `JEV_MODEL` / `jev-latest`. Requires `TYPESAFE_API_KEY` the same way `run_pack` does.

Returns `{ model, answers, usage }` — same answer shapes as `run_pack`.

## Example: public-API / changelog break (no pack)

State is one file, a short change summary, and a closed symbol list you already extracted. Questions: Noul “is this breaking?”, Score “how much changelog debt?”, Choice “which symbol first?”.

```json
{
  "state": {
    "path": "src/api/client.ts",
    "change_summary": "Renamed fetchUser to getUser and dropped the locale argument.",
    "symbols": [
      { "id": "fetchUser", "kind": "export", "note": "removed" },
      { "id": "getUser", "kind": "export", "note": "added; no locale arg" },
      { "id": "ClientOptions", "kind": "type", "note": "unchanged" }
    ]
  },
  "questions": [
    {
      "id": "is_breaking_for_callers",
      "type": "noul",
      "instructions": "Does `change_summary` plus `symbols` at `path` break existing callers (removed export, changed arity, or incompatible type)?",
      "criteria": {
        "true": "At least one caller-visible contract change is breaking.",
        "false": "Compatible rename/add, or only internal symbols moved."
      }
    },
    {
      "id": "doc_debt",
      "type": "score",
      "instructions": "How much public-doc / changelog debt does this change create?",
      "criteria": [
        "No public contract change; changelog optional.",
        "Small note: rename or added optional field.",
        "Needs a migration blurb for callers.",
        "Ship-blocker: undocumented breaking change."
      ]
    },
    {
      "id": "hottest_symbol",
      "type": "choice",
      "instructions": "Which symbol should the changelog mention first? Options are `symbols[].id` plus `none`.",
      "criteria": {
        "fetchUser": "Removed export — callers still import this name.",
        "getUser": "New export with a dropped argument.",
        "ClientOptions": "Unchanged type.",
        "none": "No symbol needs a changelog mention."
      }
    }
  ]
}
```

Then write the changelog or skip **in your code**. Jev does not edit files.

## Anti-patterns

- Free-form “write me a review”
- Open-ended options (“anything else”, empty Choice maps, one option)
- Dumping the whole repo (or a tree of file bodies) into `state`
- Stopping because `list_packs` had no match
- Calling `run_questions` when a pack shortcut already exists (`i18n_copy`, `review_diff`, `verify_gap`, …)
- Calling TypeSafe when `ping.api_key_set` is false
