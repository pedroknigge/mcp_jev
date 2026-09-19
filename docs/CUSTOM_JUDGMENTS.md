# Custom judgments (`run_questions`)

Load this when **no pack fits**. Packs are recipes, not the ceiling.

This is **not** chat and **not** essay generation. Same System One path as `run_pack`: caller-built **state** + typed **Choice / Noul / Score** questions. No side effects.

## Workflow

1. `list_packs`. If an id fits → `describe_pack` + `run_pack`.
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

## Example: i18n hardcoded copy

State is the file plus a closed candidate list you already extracted. Questions: Noul “is there user-facing copy?”, Score “how much debt?”, Choice “which candidate first?”.

```json
{
  "state": {
    "path": "src/components/Welcome.tsx",
    "candidates": [
      { "id": "hero_title", "text": "Welcome back", "kind": "jsx_text" },
      { "id": "cta", "text": "Get started", "kind": "jsx_text" },
      { "id": "debug", "text": "TODO: remove", "kind": "comment" }
    ]
  },
  "questions": [
    {
      "id": "has_user_facing_hardcoded_copy",
      "type": "noul",
      "instructions": "Does `path` contain user-facing hardcoded copy among `candidates` (not comments, not identifiers)?",
      "criteria": {
        "true": "At least one candidate is user-visible product copy that should be extracted.",
        "false": "No user-facing hardcoded copy; remaining strings are comments, identifiers, or already keyed."
      }
    },
    {
      "id": "i18n_debt",
      "type": "score",
      "instructions": "How much i18n debt is in `candidates` at `path`?",
      "criteria": [
        "No user-facing hardcoded copy, or only already-keyed strings.",
        "A few isolated strings; easy to extract.",
        "Several user-facing strings; localization will miss them.",
        "Widespread hardcoded copy; shipping this locale-broken."
      ]
    },
    {
      "id": "hottest_candidate",
      "type": "choice",
      "instructions": "Which candidate is the hottest user-facing hardcoded string to extract first? Options are `candidates[].id` plus `none`.",
      "criteria": {
        "hero_title": "Welcome back — likely visible heading.",
        "cta": "Get started — likely a button.",
        "debug": "TODO: remove — likely a comment.",
        "none": "No candidate is user-facing hardcoded copy worth extracting."
      }
    }
  ]
}
```

Then extract or skip **in your code**. Jev does not edit files.

## Anti-patterns

- Free-form “write me a review”
- Open-ended options (“anything else”, empty Choice maps, one option)
- Dumping the whole repo (or a tree of file bodies) into `state`
- Stopping because `list_packs` had no match
- Calling TypeSafe when `ping.api_key_set` is false
