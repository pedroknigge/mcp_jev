# Custom judgments (`run_questions`)

**Packs are shortcuts.** Same System One path as `run_pack`: caller-built **state** + typed **Choice / Noul / Score** questions. No side effects. This is **not** chat and **not** essay generation.

`run_questions` is first-class. Use a pack only when it matches the questions you already invented. Blind dogfood: invent first, then open the pack list — [DOGFOOD.md](DOGFOOD.md).

`i18n_copy` is the shortcut **after** that exact pattern repeated. If you invented extra heads (recipe below: `needs_locale_split`) or a different catalog, stay on this tool.

## Workflow

1. **Blind / first-class:** invent closed state + typed questions **before** opening `list_packs`.
2. Then `list_packs`. If an id matches **exactly** → `describe_pack` + `run_pack` (the shortcut).
3. If **no pack fits** (or it is only nearby): do **not** stop. Do **not** invent `ask_jev`.
4. Call **`run_questions`**.
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

## Recipe: i18n via `run_questions`

Equal prominence to `run_pack` `i18n_copy`. Harness extracts a **closed** `candidates[]` catalog. Jev does not rewrite JSX or locale JSON.

Invented heads here are **not** an exact `i18n_copy` match (extra Noul `needs_locale_split`; no `already_partially_internationalized` / `primary_bucket`). Blind protocol → **`run_questions`**. If you later invent exactly the pack heads, use the shortcut.

Runnable: `node --import tsx scripts/blind-i18n-example.mjs` (mocked in CI; `--live` optional).

```json
{
  "state": {
    "path": "src/components/LoginForm.tsx",
    "language": "tsx",
    "framework_i18n": "next-intl",
    "uses_i18n_api": false,
    "locale_files_present": true,
    "candidates": [
      { "id": "login_heading", "text": "Login", "kind": "jsx_text", "line": 12 },
      { "id": "submit_btn", "text": "Submit", "kind": "jsx_attr", "line": 40 },
      { "id": "load_error", "text": "Error loading", "kind": "toast", "line": 55 }
    ]
  },
  "questions": [
    {
      "id": "has_user_facing_hardcoded_copy",
      "type": "noul",
      "instructions": "Given `path`, `candidates`, and `uses_i18n_api`, does this file contain user-facing hardcoded copy that is not already going through an i18n API?",
      "criteria": {
        "true": "At least one candidate is user-visible copy that would ship in one language.",
        "false": "Candidates are identifiers, logs, tests, or already passed through t() / useTranslations."
      }
    },
    {
      "id": "should_migrate_to_i18n",
      "type": "noul",
      "instructions": "Should the caller extract the user-facing strings in `candidates` into the project's i18n layer before a multi-locale ship?",
      "criteria": {
        "true": "Hardcoded user-facing copy should move to locale files / t() before shipping more locales.",
        "false": "No migration needed: already i18n, copy is dev-only, or a multi-locale ship is not indicated."
      }
    },
    {
      "id": "i18n_debt",
      "type": "score",
      "instructions": "How much i18n debt does this file add to a multi-locale ship, given `candidates` and `uses_i18n_api`?",
      "criteria": [
        "Clean: no user-facing hardcoded copy.",
        "Local leftover: a few strings, easy extract.",
        "Cross-cutting: many strings or mixed buckets; needs a focused pass.",
        "Blocking for a multi-locale ship: user-facing copy would ship untranslated."
      ]
    },
    {
      "id": "hottest_candidate",
      "type": "choice",
      "instructions": "Which `candidates[].id` is the hottest string to extract first? Options are only those ids plus `none`.",
      "criteria": {
        "login_heading": "kind=jsx_text; text=Login; line=12",
        "submit_btn": "kind=jsx_attr; text=Submit; line=40",
        "load_error": "kind=toast; text=Error loading; line=55",
        "none": "No single candidate stands out to extract first."
      }
    },
    {
      "id": "needs_locale_split",
      "type": "noul",
      "instructions": "Should labels and toasts in `candidates` land in different locale namespaces (UI strings vs errors) rather than one dump?",
      "criteria": {
        "true": "UI labels and error/toast copy should split across locale files or namespaces.",
        "false": "One locale namespace is enough, or there is no user-facing copy."
      }
    }
  ]
}
```

Then extract or split **in your code**. Example gate for the shared Nouls/Score: `gateI18nCopy` in `src/policy-examples.ts`.

## Recipe: model route via `run_questions`

Equal prominence to `run_pack` `model_router` when invented lanes or Noul heads **do not** match the pack. Pack shortcut only for `fast_local` | `strong_reasoner` | `tools_heavy` | `ask_user` | `skip` plus Nouls `needs_code_edit` / `needs_browser` / `unsafe_or_irreversible` / `simple_lookup` and Score `difficulty`. Host-specific cascades (extra lanes, different Noul ids) → stay here.

```json
{
  "state": {
    "turn_id": "t1",
    "user_ask": "Refactor auth middleware across 4 files, run integration tests, push if green.",
    "context_summary": "Multi-file TypeScript change with git push; host has shell + editor tools.",
    "available_tools": ["read", "edit", "shell", "git"],
    "estimated_tokens_in_context": 18000,
    "prior_failures": 0
  },
  "questions": [
    {
      "id": "route",
      "type": "choice",
      "instructions": "Given `user_ask`, `context_summary`, and `available_tools`, which compute lane should the harness pick for this turn?",
      "criteria": {
        "cheap_local": "Trivial lookup or formatting; local/fast model enough.",
        "strong_reason": "Multi-step reasoning or careful refactor without heavy tool chaining.",
        "tools_cascade": "Needs several tool rounds (edit + shell + verify) in one turn.",
        "ask_human": "Ambiguous goal or irreversible risk; ask the user before acting.",
        "skip_turn": "Out of scope or already done; do nothing."
      }
    },
    {
      "id": "needs_shell_tools",
      "type": "noul",
      "instructions": "Does completing `user_ask` require shell/git tools from `available_tools` (not just read/edit)?",
      "criteria": {
        "true": "Shell, tests, or git push are required to finish the ask.",
        "false": "Read/edit alone would suffice."
      }
    },
    {
      "id": "irreversible_side_effect",
      "type": "noul",
      "instructions": "Would following `user_ask` risk an irreversible remote side effect (e.g. push, deploy, delete)?",
      "criteria": {
        "true": "Remote push/deploy/delete or similar is in scope.",
        "false": "Only local edits/tests; reversible."
      }
    },
    {
      "id": "difficulty",
      "type": "score",
      "instructions": "How hard is this turn given `user_ask` and `estimated_tokens_in_context`?",
      "criteria": [
        "Trivial single-step.",
        "Moderate: a few files or light reasoning.",
        "Hard: multi-file + tools + judgment.",
        "Extreme: high blast radius or long horizon."
      ]
    }
  ]
}
```

Map the lane and any confirm/refuse gate **in your code**. After the same custom pattern repeats 2–3 times, consider extending `model_router` or keeping the recipe (see BL-002 / BL-003).

## Anti-patterns

- Free-form “write me a review”
- Open-ended options (“anything else”, empty Choice maps, one option)
- Dumping the whole repo (or a tree of file bodies) into `state`
- Stopping because `list_packs` had no match
- Stretching a nearby pack when invented questions do not match exactly (`i18n_copy` / `model_router` are shortcuts only for their exact heads)
- Opening the pack list before inventing questions on a **blind** dogfood
- Calling TypeSafe when `ping.api_key_set` is false
