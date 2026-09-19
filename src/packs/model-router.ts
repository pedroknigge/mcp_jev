import type { PackDefinition } from "./types.js";

export const modelRouterPack: PackDefinition = {
  id: "model_router",
  version: "1.0.0",
  title: "Model router",
  summary:
    "Per-turn compute lane: Choice route (fast_local | strong_reasoner | tools_heavy | ask_user | skip), Nouls for code/browser/unsafe/lookup, Score difficulty.",
  when_to_use:
    "At the start of an agent turn, before spending a frontier model or a long tool loop. Use this to pick a lane. Do not use it to generate the reply, edit files, or drive a GUI (`computer_use_step`).",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["user_request"],
    properties: {
      user_request: {
        type: "string",
        description: "What the user asked this turn (or the remaining goal).",
        minLength: 1,
      },
      agent_so_far: {
        type: "string",
        description: "Optional short summary of what the agent already did or tried.",
      },
      available_tools: {
        type: "array",
        description: "Optional names of tools the host can actually call this turn.",
        items: { type: "string" },
      },
      files_in_scope: {
        type: "array",
        description: "Optional paths or globs already in context.",
        items: { type: "string" },
      },
      last_error: {
        type: "string",
        description: "Optional last tool or compile error, if this is a retry.",
      },
      flags: {
        type: "object",
        description: "Optional caller-computed heuristics.",
        additionalProperties: false,
        properties: {
          has_uncommitted_diff: {
            type: "boolean",
            description: "There is already a local diff in play.",
          },
          prior_tool_failure: {
            type: "boolean",
            description: "The previous tool call failed or was a no-op.",
          },
          user_waiting: {
            type: "boolean",
            description: "The user is blocked on a question or confirm.",
          },
        },
      },
    },
  },
  example_state: {
    user_request: "Add a failing test for the empty-catalog path, then make it pass.",
    agent_so_far: "Located the pack registry. No edits yet.",
    available_tools: ["read", "edit", "shell", "browser"],
    files_in_scope: ["src/packs/registry.ts", "test/packs.test.ts"],
    last_error: "",
    flags: {
      has_uncommitted_diff: false,
      prior_tool_failure: false,
      user_waiting: false,
    },
  },
  questions: [
    {
      type: "choice",
      id: "route",
      instructions:
        "Given `user_request`, `agent_so_far`, `available_tools`, `files_in_scope`, `last_error`, and `flags`, which compute lane should this turn use? Pick one. Do not invent a sixth lane.",
      criteria: {
        fast_local:
          "Cheap or local model, or no model: lookup, format, small mechanical edit, or a single obvious tool call.",
        strong_reasoner:
          "Needs a strong reasoner: ambiguous design, hard failure, or a plan that is not yet mechanical.",
        tools_heavy:
          "Needs a long tool / browser / shell loop more than a single model burst.",
        ask_user:
          "Missing a preference, secret, or confirmation the agent must not guess — especially if irreversible.",
        skip: "Nothing useful to do this turn; the request is already done, blocked, or out of scope.",
      },
    },
    {
      type: "noul",
      id: "needs_code_edit",
      instructions: "Does this turn need the agent to edit source or config files?",
      criteria: {
        true: "A code or config change is required to make progress.",
        false: "No file edit is needed (question, lookup, or talk-only).",
      },
    },
    {
      type: "noul",
      id: "needs_browser",
      instructions:
        "Does this turn need a browser or live page (not just reading a local file that mentions a URL)?",
      criteria: {
        true: "A real browser / page observation is required.",
        false: "No browser is required this turn.",
      },
    },
    {
      type: "noul",
      id: "unsafe_or_irreversible",
      instructions:
        "Would following the request (as stated) do something unsafe or hard to undo — destructive data, secrets, production, or irreversible send/pay/delete?",
      criteria: {
        true: "Unsafe or irreversible if executed without a human gate.",
        false: "Reversible or read-only at the stated scope.",
      },
    },
    {
      type: "noul",
      id: "simple_lookup",
      instructions:
        "Is this turn a simple lookup or recitation from `files_in_scope` / known tools, with no real decision?",
      criteria: {
        true: "A fetch or short read answers it.",
        false: "It needs judgment, multi-step work, or an edit.",
      },
    },
    {
      type: "score",
      id: "difficulty",
      instructions: "How hard is this turn given the state?",
      criteria: [
        "Trivial lookup or format.",
        "Routine bounded change.",
        "Multi-step or unclear.",
        "Hard: novel, unsafe, or wide blast radius.",
      ],
    },
  ],
  suggested_workflow: [
    "Put the user request in `user_request`. Add a short `agent_so_far`, tool names you can actually call, and files already in context.",
    "run_pack model_router.",
    "Map `route.choice` in code to your models and tools. Jev does not invoke them.",
    "Apply thresholds in caller code (same idea as confidence gating). Example starting point below — tune on your traces.",
    "needs_code_edit / needs_browser are hints for which tools to enable, not a license to skip your own allowlists.",
  ],
  notes: [
    "Lane semantics (closed catalog — do not invent a sixth lane): fast_local = cheap/local or no model (lookup, format, one obvious tool); strong_reasoner = ambiguous design, hard failure, or a plan that is not yet mechanical; tools_heavy = long tool/browser/shell loop more than a single model burst; ask_user = missing preference, secret, or confirmation (especially irreversible); skip = already done, blocked, or out of scope.",
    "Example thresholds (caller-owned; tune on your traces): if route.confidence < 0.45 → treat as ask_user; if unsafe_or_irreversible.noul ≥ 0.70 → refuse or confirm before tools_heavy / strong_reasoner; if simple_lookup.noul ≥ 0.75 and difficulty.score < 1.5 → force fast_local; if needs_browser.noul ≥ 0.70 and route is fast_local → consider tools_heavy; if difficulty.score ≥ 2.5 and route is fast_local → consider strong_reasoner.",
    "Thresholds live in caller code, not in this MCP.",
    "Compose with other packs: use model_router first, then intent_router for an utterance, computer_use_step for a GUI catalog, review_diff for a generic diff, code_audit for a per-file structured audit, or pr_audit (domain example) for a money/hours/migration merge.",
    "Closed route catalog. Fork the pack in-repo if you need another lane name.",
  ],
};
