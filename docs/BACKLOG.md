# mcp_jev product backlog

> Pedro: *“expandir hasta el infinito y más allá, convertí todo el hallazgo en backlog.”*

Ecosystem Jev loops (harness, routing, open models, domain demos) become **product ideas** for this repo. They are not endorsements, star counts, or code to copy. Patterns are reimplemented as **packs**, **`run_questions` recipes**, or **harness notes** — no third-party trademarks in tool ids, no vendored foreign MCP.

**Docs (this file):** [https://github.com/pedroknigge/mcp_jev/blob/main/docs/BACKLOG.md](https://github.com/pedroknigge/mcp_jev/blob/main/docs/BACKLOG.md) · Custom path: [CUSTOM_JUDGMENTS.md](CUSTOM_JUDGMENTS.md) · Releases: [RELEASES.md](RELEASES.md)

## Vision

mcp_jev is a **local harness kit** plus a **typed custom ceiling**. The harness (browser, Mac AX/OCR, Android, voice, coding agent) owns observation, catalogs, writer LLMs, clicks, and stop rules. This MCP owns millisecond-tier **Choice / Noul / Score** judgments over short named state — versioned **packs** when the loop is known, **`run_questions`** when it is not. The product is not a chat model, not an executor, and not a generic “audit menu.” Elevate the gates harnesses actually call (`computer_use_step`, `model_router`, `command_risk`, `run_questions`). Demote unused audit packs after usage proof.

## Product pivot (already agreed)

| Keep / elevate | Treat as weak until a harness consumes them |
| --- | --- |
| `computer_use_step` | Generic audit menu (`pr_audit`, unused review/scan packs without a caller) |
| `model_router` | Essay-shaped “review this repo” packs |
| `command_risk` | New domain packs with no dogfood loop |
| `run_questions` (ceiling for novel judgments) | Dumping trees into state |

**Packs are shortcuts.** `list_packs` first. If an id fits, `run_pack`. If none fits, do not stop and do not invent `ask_jev` — build closed state + typed questions and call `run_questions`. After a custom pattern repeats 2–3 times, upstream a pack ([CONTRIBUTING.md](../CONTRIBUTING.md)).

## How to read an item

Every `BL-###` has: **problem**, **Jev shape** (Choice / Noul / Score), **state sketch**, **success metric**, **inspiration** (public repo when verified; otherwise the X/ecosystem name only — no invented URLs or stars).

| Horizon | Meaning |
| --- | --- |
| **Now (P0)** | Ship or dogfood against current packs / `run_questions` |
| **Next (P1)** | Recipes, schemas, or research that unblock harnesses |
| **Later** | Real ideas, not this week |
| **Icebox** | Parked; do not start without Pedro |
| **Anti-backlog** | Will not do |

P0/P1 rows have GitHub issues labeled `backlog` / `harness` / `research`. Numbers are in the tables below.

---

## Now (P0)

| ID | Item | Shape | Issue |
| --- | --- | --- | --- |
| [BL-001](#bl-001--computer_use_step-to-ultrafast-parity) | Elevate `computer_use_step` to ultrafast parity | Choice + Noul + Score | [#32](https://github.com/pedroknigge/mcp_jev/issues/32) |
| [BL-002](#bl-002--model_router-dogfood-for-cursor--claude-code) | `model_router` dogfood for Cursor / Claude Code | Choice + Noul + Score | [#35](https://github.com/pedroknigge/mcp_jev/issues/35) |
| [BL-003](#bl-003--skill-teach-run_questions-from-each-inspiration) | Skill: teach `run_questions` with copy-paste recipes | Choice / Noul / Score (custom) | [#42](https://github.com/pedroknigge/mcp_jev/issues/42) |
| [BL-004](#bl-004--pack-usage-telemetry--deprecate-unused-audit-packs) | Pack usage telemetry; deprecate packs without harness consumers | Noul + Choice | [#41](https://github.com/pedroknigge/mcp_jev/issues/41) |
| [BL-005](#bl-005--wind-tunnel-style-latency--cost-harness) | Benchmark harness (latency / cost) for packs + `run_questions` | Score (+ usage) | [#43](https://github.com/pedroknigge/mcp_jev/issues/43) |

## Next (P1)

| ID | Item | Shape | Issue |
| --- | --- | --- | --- |
| [BL-006](#bl-006--voicemac-computer_use-recipe) | Voice → `computer_use_step` recipe | Choice + Noul | [#33](https://github.com/pedroknigge/mcp_jev/issues/33) |
| [BL-007](#bl-007--android-observation-schema-mobile_jev-style) | Android observation schema (mobile-jev style) | Choice + Noul + Score | [#34](https://github.com/pedroknigge/mcp_jev/issues/34) |
| [BL-008](#bl-008--orbit-style-multi-host-decision-burst) | Orbit / MCP multi-host decision burst (32 / 6s pattern) | many Noul / Choice | [#36](https://github.com/pedroknigge/mcp_jev/issues/36) |
| [BL-009](#bl-009--langchain-tool-gate-using-command_risk-or-run_questions) | LangChain / tool-gate middleware example | Noul + Score | [#37](https://github.com/pedroknigge/mcp_jev/issues/37) |
| [BL-010](#bl-010--retrieve_then_judge-closed-passage-choice) | retrieve-then-judge (closed passage Choice) | Choice + Noul + Score | [#38](https://github.com/pedroknigge/mcp_jev/issues/38) |
| [BL-011](#bl-011--provider-plugin-research-openjev--nanojev) | Provider / plugin research (openjev, NanoJev) | n/a (research) | [#40](https://github.com/pedroknigge/mcp_jev/issues/40) · related [#17](https://github.com/pedroknigge/mcp_jev/issues/17) |
| [BL-012](#bl-012--trading_loop-as-run_questions-recipe-not-a-live-pack) | Trading loop as `run_questions` recipe (dry-run) | Choice + Noul + Score | [#39](https://github.com/pedroknigge/mcp_jev/issues/39) |

## Later

| ID | Item | Shape |
| --- | --- | --- |
| [BL-013](#bl-013--mac-ocrax-computer-use-notes) | Mac OCR / AX → next click (typesafe-computer-use notes) | Choice |
| [BL-014](#bl-014--observe-act-verify-browser-skill) | observe-act-verify browser skill | Choice + Noul |
| [BL-015](#bl-015--per-turn-cheap-vs-strong-beyond-model_router) | Per-turn cheap vs strong (jev-router depth) | Choice + Score |
| [BL-016](#bl-016--gateway-hosting-notes-openrouter--vercel--netlify) | Gateway hosting notes (OpenRouter / Vercel / Netlify) | n/a |
| [BL-017](#bl-017--local-system-one-like-openjev--semif) | Local System One–like (openjev / SemIf) | same primitives |
| [BL-018](#bl-018--train-choice-over-text-candidates-jevlike) | Train Choice over text candidates (jevlike) | Choice |
| [BL-019](#bl-019--open-judges-nanojev--decider-2b) | Open judges (NanoJev / Decider-2B) | Choice / Noul / Score |
| [BL-020](#bl-020--in-repo-recipes-cookbook) | In-repo recipes cookbook (awesome-jev pattern) | n/a |
| [BL-021](#bl-021--ecosystem-aggregator-listing) | Ecosystem aggregator listing (jev-hub) | n/a |
| [BL-022](#bl-022--archive-unused-audit-packs-after-usage-proof) | Archive unused audit packs after usage proof | Choice |
| [BL-023](#bl-023--speak-before-utterance-ends) | Speak-before-utterance-ends voice loop | Choice |
| [BL-024](#bl-024--webmcp--mercury-cost-comparison) | WebMCP + Mercury cost comparison | Score |

## Icebox

| ID | Item | Why parked |
| --- | --- | --- |
| [BL-025](#bl-025--live-trading-execution) | Live trading execution | Dry-run recipe only until Pedro says |
| [BL-026](#bl-026--public-http-hosted-mcp_jev) | Public HTTP hosted mcp_jev | Stdio + local key store is the product |
| [BL-027](#bl-027--npm-publish) | npm publish | Blocked until Pedro says; see [RELEASES.md](RELEASES.md) |
| [BL-028](#bl-028--more-audit-packs-without-a-harness) | More audit packs without a harness | Generic menu already feels weak |

---

## Now (P0) — details

### BL-001 — `computer_use_step` to ultrafast parity

**Problem.** `computer_use_step` already fans out `operation` plus speculative `click_target` / `type_target` / `offscreen_target`, rejects screenshots, and marks `writer_owns_typed_string`. Ecosystem ultrafast loops still beat us on catalog hygiene (DOM-closed ids, cap before 255), writer-LLM contract examples, and a published flight-time demo (~7s class) agents can copy.

**Jev shape.** Choice `operation` + per-op target Choices; Nouls `goal_achieved` / `observation_stale`; Score `step_confidence`. Additive `guidance` stays schema-stable.

**State sketch.** `goal`, `app_or_url`, short `observation_summary`, closed `items[]` / `offscreen_items[]` (`id`, `role`, `label`, optional `source: dom|ax|ocr`), `history[]`, `flags`. No pixels.

**Success metric.** A README/skill recipe that a browser harness can run without inventing ids; writer LLM invoked only on `type_text` / `type_email`; harness uses `guidance.effective_targets` only. Optional timed demo (same closed catalog, wall-clock published). Do **not** vendor foreign code.

**Inspiration.** [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast) — DOM closed catalog, op+target fan-out, small LLM only for TYPE_TEXT.

### BL-002 — `model_router` dogfood for Cursor / Claude Code

**Problem.** `model_router` exists (`fast_local` | `strong_reasoner` | `tools_heavy` | `ask_user` | `skip`) but this repo does not dogfood it on real Cursor / Claude Code turns. Ecosystem routers already pick cheap vs strong per turn.

**Jev shape.** Choice `route`; Nouls `needs_code_edit` / `needs_browser` / `unsafe_or_irreversible` / `simple_lookup`; Score `difficulty`.

**State sketch.** `user_request`, `agent_so_far`, `available_tools[]`, `files_in_scope[]`, `last_error`, `flags.has_uncommitted_diff` / `prior_tool_failure` / `user_waiting`.

**Success metric.** A host-side snippet (Cursor or Claude Code) that calls `run_pack` `model_router` at turn start, maps `route.choice` in **code**, and unit-tests the gate without a TypeSafe key. One recorded trace: cheap lane on lookup, strong lane on ambiguous design.

**Inspiration.** [gargpratyush/jev-router](https://github.com/gargpratyush/jev-router) — Claude Code / Codex per-turn cheap vs strong.

### BL-003 — Skill: teach `run_questions` from each inspiration

**Problem.** `run_questions` is the ceiling ([CUSTOM_JUDGMENTS.md](CUSTOM_JUDGMENTS.md)) but the skill still teaches packs first. Agents stop at `list_packs` or invent essays. Each ecosystem finding should become a **copy-paste recipe** (state + typed questions), not a new pack.

**Jev shape.** Caller-built Choice / Noul / Score only. Fail-closed schema already in `src/custom-questions.ts`.

**State sketch.** Per recipe: a closed object (catalog ids, not a repo dump) + 1–3 questions. Examples to cover: GUI next-op, voice intent, Android catalog, model lane, tool-risk Noul, passage Choice (`L000`…), dry-run trade, burst of inbox Nouls.

**Success metric.** `skills/mcp_jev/SKILL.md` (or a `references/` page) has one pasteable JSON body per Now/Next inspiration. `npm test` still fails if skill/catalog drift. Agents can run a novel judgment without a new pack id. Blind protocol + first-class i18n `run_questions` recipe: [DOGFOOD.md](DOGFOOD.md).

**Inspiration.** This repo’s custom path + the Now/Next inspiration list. Cookbook pattern: [Anil-matcha/awesome-jev-by-typesafe](https://github.com/Anil-matcha/awesome-jev-by-typesafe).

### BL-004 — Pack usage telemetry / deprecate unused audit packs

**Problem.** The generic audit menu (`pr_audit`, and any review/scan pack without a harness consumer) feels weak next to harness gates. We have no usage proof. “Pedorro” / unused packs should not stay first-class forever.

**Jev shape.** Optional local Noul `pack_was_useful` + Choice `keep` | `demote` | `archive` on a **caller-owned** log — not a hosted dashboard.

**State sketch.** Local-only counters: `pack_id`, `call_count`, `host`, `had_harness_follow_up` (boolean the caller sets). Never send secrets or full state off-box. Default: file under `~/.mcp_jev/` if we add this at all.

**Success metric.** After a documented window, packs with zero harness consumers are marked demoted in README/`when_to_use` (or archived). Keep/elevate list stays: `computer_use_step`, `model_router`, `command_risk`, `run_questions`. No public telemetry phone-home.

**Inspiration.** Product pivot (this file). Not a third-party SaaS.

### BL-005 — Wind-Tunnel-style latency / cost harness

**Problem.** Packs and `run_questions` claim millisecond-tier judgments; we only mock `systemOne` in CI ([#16](https://github.com/pedroknigge/mcp_jev/issues/16)). Ecosystem benches publish latency and $ / decision. We need an in-repo harness that measures **our** packs, not a copied foreign bench.

**Jev shape.** Existing pack questions + `usage` from TypeSafe. Optional Score `difficulty` on the fixture itself is out of scope — measure wall-clock and token usage.

**State sketch.** Fixture JSONL: `{ pack_id or run_questions body, state, expect_keys[] }`. Runner prints p50/p95 latency, `usage`, estimated cost if the API returns it.

**Success metric.** `npm run bench` (or a script) runs against a live key **only when present**, skips otherwise (same rule as #16). Publishes a table for `computer_use_step`, `model_router`, `command_risk`, and one `run_questions` burst. No Mercury/WebMCP code copied in.

**Inspiration.** X/ecosystem finding: 0xidanlevin Wind-Tunnel / WebMCP + Jev + Mercury cost benchmarks (no public repo verified here). Related live-key gate: [#16](https://github.com/pedroknigge/mcp_jev/issues/16).

---

## Next (P1) — details

### BL-006 — Voice→Mac `computer_use` recipe

**Problem.** Voice harnesses need a judgment **before** the utterance ends. We have `intent_router` (utterance) and `computer_use_step` (catalog) but no recipe that composes them: partial transcript → closed op/target, writer LLM still owns typed strings.

**Jev shape.** Choice `intent` or reuse `computer_use_step.operation`; Noul `utterance_complete` (caller decides whether to wait).

**State sketch.** `partial_transcript`, `goal`, same `items[]` catalog as the GUI step, `flags.keyboard_visible`.

**Success metric.** Skill/README recipe: observe AX/OCR in code → `run_pack` `computer_use_step` (or `run_questions` if the catalog differs) on each partial; do not block the writer on Jev. Document that streaming-before-end is Later ([BL-023](#bl-023--speak-before-utterance-ends)).

**Inspiration.** X/ecosystem finding: instantricecook voice→Mac computer-use (speak before the utterance ends). No GitHub URL verified under that name.

### BL-007 — Android observation schema (mobile-jev style)

**Problem.** `computer_use_step` is GUI-generic (`source`, `keyboard_visible`, `compose`) but has no Android-shaped example (content desc, package, hierarchy dump → closed ids). Real Android agents need a stable observation schema, not a new chat tool.

**Jev shape.** Same as `computer_use_step` unless the catalog diverges; then `run_questions` until a pack is justified.

**State sketch.** `goal`, `app_or_url` (package / activity), `observation_summary`, `items[]` with `id` from resource-id or accessibility, `flags.keyboard_visible` / `irreversible_ahead`.

**Success metric.** Pack notes + `example_state` (or a skill recipe) an Android harness can fill without screenshots. New pack **only** if fields cannot fit `computer_use_step`. No copied mobile-jev code.

**Inspiration.** [droidrun/mobile-jev](https://github.com/droidrun/mobile-jev).

### BL-008 — Orbit-style multi-host decision burst

**Problem.** Inbox / leads / X-feed loops need **many** tiny judgments in one burst (ecosystem claim: 32 decisions / ~6s / ~$0.0006). We have one-pack-per-call and `run_questions` (parallel questions, one state). We do not document a multi-host burst recipe.

**Jev shape.** One `run_questions` with many Nouls/Choices on one compact state, **or** N parallel `run_pack` calls (same idea as `mcp_jev scan`). Not one essay.

**State sketch.** Closed `items[]` (`id`, `kind: inbox|lead|post`, `snippet` ≤ a tweet-length). Questions: per-id Noul `needs_reply` **or** one Choice `hottest_id` plus Score `urgency`.

**Success metric.** Recipe showing 32 closed items → one or few `systemOne` calls, caller-owned gate, no side effects (no posting). Publish latency/$ from BL-005 if a key is present. Do not claim the 32/6s/$0.0006 numbers as ours until measured.

**Inspiration.** X/ecosystem finding: blumbuilds Orbit MCP (inbox / leads / X feed). No public repo verified here.

### BL-009 — LangChain / tool-gate using `command_risk` or `run_questions`

**Problem.** LangChain already gates risky tool calls with Jev (`AutoModeMiddleware`). Coding hosts here should do the same with **`command_risk`** (shell) or a `run_questions` Noul (arbitrary tool name + args summary). We have signals + `src/policy-examples.ts` but no middleware example.

**Jev shape.** Nouls `is_destructive` / `touches_credentials` / `scope_matches`; Score `severity`. Or custom Noul `too_risky_to_run`.

**State sketch.** `command` (or `tool` + `args_summary`), `cwd`, `reason`, `allowed_roots[]`. No env files, no key values.

**Success metric.** A short example (Python or TS) that refuses the tool in **code** when Noul/Score crosses a unit-tested threshold. Allowlist/sandbox still required. Not a hosted proxy.

**Inspiration.** [LangChain TypeSafe integration](https://github.com/langchain-ai/docs/blob/main/src/oss/python/integrations/providers/typesafe.mdx) — `AutoModeMiddleware` / `ModelRouterMiddleware`.

### BL-010 — retrieve_then_judge (closed passage Choice)

**Problem.** RAG loops ask chat models to “pick a passage.” Jev should Choice over **caller-supplied ids** (`L000`, `L001`, …) after a retriever already listed them. No pack yet; this is a `run_questions` recipe (or a pack only after 2–3 repeats).

**Jev shape.** Choice `passage` from closed `passages[].id` plus `none`; Noul `evidence_sufficient`; Score `grounding`.

**State sketch.** `claim`, `passages: [{ id: "L000", text: "…" }]` (short; cap in the harness), optional `query`.

**Success metric.** Copy-paste recipe in the skill. Caller never invents an id. Empty catalog → do not call TypeSafe.

**Inspiration.** X/ecosystem finding: retrieve-then-judge (Choice over `L000` passage ids). No single canonical repo verified here.

### BL-011 — Provider / plugin research (openjev / NanoJev)

**Problem.** `run_pack` / `run_questions` always call TypeSafe `systemOne`. Agents without a key can list/describe but cannot judge offline. Open local System One–like projects exist. [#17](https://github.com/pedroknigge/mcp_jev/issues/17) already proposes an optional plugin interface.

**Jev shape.** Same pack / `run_questions` primitives. Plugin must return Choice / Noul / Score shapes — not prose.

**State sketch.** n/a (research). Spike notes: map `PackQuestion[]` onto one backend; keep tools closed.

**Success metric.** Written comparison (openjev / SemIf, NanoJev, optional Decider-2B): can it answer our question types without `ask_jev`? Recommend extend #17 or close as not-now. Default provider stays TypeSafe. No trademarks as pack ids.

**Inspiration.** [TheoLeeCJ/SemIf](https://github.com/TheoLeeCJ/SemIf) (formerly OpenJev), [TianyuCodings/NanoJev](https://github.com/TianyuCodings/NanoJev), [#17](https://github.com/pedroknigge/mcp_jev/issues/17). Decider-2B: ecosystem name only (no repo verified here).

### BL-012 — `trading_loop` as `run_questions` recipe (not a live pack)

**Problem.** Closed buy/sell loops are a clear Jev shape, but a `trading_loop` pack would grow the weak domain-pack menu and invite live-money side effects. Prefer a **dry-run `run_questions` recipe**. Promote to a pack only after repeats **and** Pedro.

**Jev shape.** Choice `action` (`buy` | `sell` | `hold` | `skip`); Noul `signal_is_actionable`; Score `conviction`.

**State sketch.** `pair`, `closed_book: { bid, ask, mid }`, `position`, `rules[]` (caller policy text, short), `dry_run: true` required in the recipe.

**Success metric.** Skill recipe defaults to dry-run. Jev never places an order. Live execution stays Icebox ([BL-025](#bl-025--live-trading-execution)).

**Inspiration.** [jarrodwatts/jev-trader](https://github.com/jarrodwatts/jev-trader) — buy/sell closed choice loops. Pattern only.

---

## Later — details

### BL-013 — Mac OCR/AX computer-use notes

**Problem.** Mac harnesses OCR / accessibility-tree then ask Jev for the next click. Our pack already accepts `source: ax|ocr`; we lack a Mac-shaped recipe (AppKit roles, AX paths as ids).

**Jev shape.** Choice `operation` + `click_target` from AX/OCR ids.

**State sketch.** Same `computer_use_step` schema; `items[].source` = `ax` or `ocr`; `app_or_url` = app name.

**Success metric.** Recipe: observe on Mac in code → `run_pack` → click in the harness. No screenshots in state.

**Inspiration.** [awlevin/typesafe-computer-use](https://github.com/awlevin/typesafe-computer-use).

### BL-014 — observe-act-verify browser skill

**Problem.** Browser skills that only act (no verify) loop. A third Jev snap — “did the DOM match the goal?” — belongs in the harness after the click, not inside mcp_jev side effects.

**Jev shape.** After act: Noul `goal_achieved` (already on `computer_use_step`) or a `run_questions` Noul `observation_matches_expect`.

**State sketch.** `goal`, `expect_visible`, post-act `observation_summary`, closed `items[]`.

**Success metric.** Skill section: observe → act → verify. Stop rules stay in the harness.

**Inspiration.** X/ecosystem finding: vlad-terin/jev-browser (observe-act-verify). No public repo verified under that owner.

### BL-015 — Per-turn cheap vs strong beyond `model_router`

**Problem.** Some routers pick model **and** thinking depth / speed mode per turn. `model_router` lanes may be enough; if dogfood (BL-002) shows missing heads, extend the pack or use `run_questions`.

**Jev shape.** Extra Choice `thinking` (`none` | `low` | `high`) and/or Score `budget` — only if BL-002 needs it.

**State sketch.** Same as `model_router` plus `host: cursor|claude_code|codex`.

**Success metric.** No sixth `route` lane invented. Fork in-repo if a new closed catalog is required.

**Inspiration.** [gargpratyush/jev-router](https://github.com/gargpratyush/jev-router).

### BL-016 — Gateway hosting notes (OpenRouter / Vercel / Netlify)

**Problem.** People host Jev-compatible gateways. This repo is stdio + `TYPESAFE_BASE_URL` override. We should document “point the SDK at a gateway” without turning mcp_jev into a public proxy.

**Jev shape.** n/a (config). Same packs / `run_questions`.

**State sketch.** Env: `TYPESAFE_BASE_URL`, key still in `~/.mcp_jev/.env`.

**Success metric.** A paragraph in README or INSTALL: local stdio, optional base URL, never deploy this binary as HTTP.

**Inspiration.** X/ecosystem finding: OpenRouter / Vercel / Netlify gateways hosting Jev. TypeSafe SDK already accepts `TYPESAFE_BASE_URL`.

### BL-017 — Local System One–like (openjev / SemIf)

**Problem.** Offline / no-waitlist System One–like stacks exist. After BL-011, optionally wire one as a plugin.

**Jev shape.** Same Choice / Noul / Score contract.

**State sketch.** Plugin config in `~/.mcp_jev/` — not host JSON.

**Success metric.** One optional backend that can answer `intent_router` example_state offline. TypeSafe remains default.

**Inspiration.** [TheoLeeCJ/SemIf](https://github.com/TheoLeeCJ/SemIf).

### BL-018 — Train Choice over text candidates (jevlike)

**Problem.** Training a tiny model to Choice among text candidates is research, not an MCP feature. Useful if we ever ship a local judge (BL-011 / BL-019).

**Jev shape.** Choice over caller strings.

**State sketch.** `{ query, candidates: [{ id, text }] }`.

**Success metric.** Design note only unless Pedro wants a plugin. Do not train in this repo by default.

**Inspiration.** [vinnylarouge/jevlike](https://github.com/vinnylarouge/jevlike).

### BL-019 — Open judges (NanoJev / Decider-2B)

**Problem.** Small open judges (0.6B-class / 2B-class) are product ideas for offline `run_pack`. Blocked on BL-011.

**Jev shape.** Same primitives if the backend can emit them.

**State sketch.** Plugin model id + pack questions.

**Success metric.** Spike: one pack (`command_risk` or `intent_router`) through an open judge. Quality bar written down; no silent fallback to chat.

**Inspiration.** [TianyuCodings/NanoJev](https://github.com/TianyuCodings/NanoJev). Decider-2B: ecosystem name only.

### BL-020 — In-repo recipes cookbook

**Problem.** Awesome-lists collect Jev recipes. We should not become an aggregator; we should keep **our** copy-paste recipes next to the skill (BL-003).

**Jev shape.** n/a (docs).

**State sketch.** One file per recipe under `docs/recipes/` or skill `references/`.

**Success metric.** Cookbook links only to in-repo recipes + CUSTOM_JUDGMENTS. No scraped third-party READMEs.

**Inspiration.** [Anil-matcha/awesome-jev-by-typesafe](https://github.com/Anil-matcha/awesome-jev-by-typesafe).

### BL-021 — Ecosystem aggregator listing

**Problem.** Hubs list X threads and demos. Out of scope for mcp_jev except a short “related projects” pointer that does not invent stars.

**Jev shape.** n/a.

**State sketch.** n/a.

**Success metric.** Optional README sentence pointing at this backlog. We do not scrape X.

**Inspiration.** [mizzlelover/jev-hub](https://github.com/mizzlelover/jev-hub).

### BL-022 — Archive unused audit packs after usage proof

**Problem.** After BL-004, some packs will still have zero harness consumers. Archiving (keep id, hide from default `list_packs`, or mark `when_to_use: archived`) needs a separate change so we do not break old callers casually.

**Jev shape.** Choice `disposition` (`keep` | `hide` | `delete`) is a **maintainer** decision, not a Jev call.

**State sketch.** Usage log from BL-004 + Pedro sign-off.

**Success metric.** Documented deprecation window. `run_pack` still works for hidden ids or a migration note exists.

**Inspiration.** Product pivot (this file).

### BL-023 — Speak-before-utterance-ends

**Problem.** BL-006 is a static recipe. True streaming (judge on partial ASR before the user stops talking) needs a harness event loop, not a new MCP tool.

**Jev shape.** Repeated Choice on growing `partial_transcript` + stable `items[]`.

**State sketch.** `partial_transcript`, `items[]`, `seq`.

**Success metric.** External harness demo; mcp_jev stays one-shot `run_pack` / `run_questions`.

**Inspiration.** Same as BL-006 (instantricecook finding).

### BL-024 — WebMCP + Mercury cost comparison

**Problem.** Foreign benches compare Jev to other models on WebMCP-shaped tasks. We should not import that stack; after BL-005 we may add a column “same fixtures vs model X” if Pedro wants.

**Jev shape.** Score / usage comparison in the bench runner.

**State sketch.** Same fixtures as BL-005.

**Success metric.** Optional extra column. No copied Wind-Tunnel / Mercury code.

**Inspiration.** X/ecosystem finding: 0xidanlevin Wind-Tunnel / WebMCP + Mercury.

---

## Icebox — details

### BL-025 — Live trading execution

**Problem.** Closing the loop from Choice `buy`/`sell` to an exchange.

**Jev shape.** Same as BL-012.

**State sketch.** Secrets must never enter pack state.

**Success metric.** n/a until Pedro unparks. Default remains dry-run.

**Inspiration.** [jarrodwatts/jev-trader](https://github.com/jarrodwatts/jev-trader) (pattern). Side effects stay in the caller.

### BL-026 — Public HTTP hosted mcp_jev

**Problem.** Turning this stdio server into a public URL would proxy keys and state.

**Jev shape.** n/a.

**State sketch.** n/a.

**Success metric.** Out of product. README already: do not deploy as a public HTTP proxy.

**Inspiration.** Anti-pattern in [CONTRIBUTING.md](../CONTRIBUTING.md).

### BL-027 — npm publish

**Problem.** `npx mcp_jev` is convenient; Pedro has not authorized registry publish.

**Jev shape.** n/a.

**State sketch.** n/a.

**Success metric.** Stay on GitHub Releases ([RELEASES.md](RELEASES.md)). Closed [#15](https://github.com/pedroknigge/mcp_jev/issues/15) / [#8](https://github.com/pedroknigge/mcp_jev/issues/8) were publish checklists, not permission.

**Inspiration.** Maintainer policy.

### BL-028 — More audit packs without a harness

**Problem.** Adding `*_audit` packs because a domain is trendy.

**Jev shape.** Tempting Nouls that nobody gates on.

**State sketch.** PR-shaped dumps.

**Success metric.** Reject unless a harness already calls `run_questions` 2–3 times (how `i18n_copy` landed).

**Inspiration.** Product pivot: generic audit menu feels weak.

---

## Anti-backlog (will not do)

These are **not** icebox — they are rejected. Do not open “just in case” issues.

| Rejected | Why |
| --- | --- |
| Free-form chat tools / `ask_jev` / “write me a review” | Not System One. `run_questions` is typed Choice / Noul / Score only. |
| Dumping repos, monorepos, or file-body trees into state | `code_audit` Pass 1 is signals-only; `run_questions` state must stay a small JSON object. |
| Essay packs (prose in, prose out) | Jev returns `choice` / `noul` / `score`. Comments and patches stay in the caller. |
| Screenshots / pixels / image blobs in Jev state | `computer_use_step` rejects them. Observe in the harness. |
| Side effects inside the MCP (click, merge, tweet, order, refund) | Judgment layer only. |
| Public hosted proxy of this binary | Key + ticket/diff state stay local. |
| Copying third-party MCP code or using their trademarks as pack ids | Reimplement the **loop**, keep our ids. |
| Invented TypeSafe fields or endpoints | [docs.typesafe.ai/llms.txt](https://docs.typesafe.ai/llms.txt) is source of truth. |
| Secrets in state or host `mcp.json` | Key once in `~/.mcp_jev/.env`. |
| npm publish from a PR / tag / laptop | Until Pedro says; see versioning below. |

---

## Versioning

Public line is **GitHub Releases only**, starting at **0.0.9**. Bump **one path at a time**, patch first (`0.0.9` → `0.0.10` → …). When a path reaches **99**, roll (`0.0.99` → `0.1.0`). Tag `v` + `package.json` version. Details: [RELEASES.md](RELEASES.md).

**Do not `npm publish`** until Pedro says. Install/update from git: `scripts/install.sh` / `scripts/update.sh`. Earlier 0.1.x / 0.2.0 numbers in history were pre-release bookkeeping, not the public line.

Related open research: provider plugins [#17](https://github.com/pedroknigge/mcp_jev/issues/17), live e2e gated on key [#16](https://github.com/pedroknigge/mcp_jev/issues/16).
