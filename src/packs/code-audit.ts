import { ToolError } from "../errors.js";
import { readStringCatalog, stringCatalogChoiceCriteria } from "./catalog-choice.js";
import type { PackDefinition, PackQuestion } from "./types.js";

/** Pass-2 excerpt hard cap. Pass 1 is signals-only — do not send bodies. */
export const MAX_EXCERPT_CHARS = 1200;
export const MAX_TOP_IMPORTS = 8;
export const MAX_REPO_CONTEXT_CHARS = 280;
export const MAX_BATCH_NOTES_CHARS = 400;

const PRIMARY_CONCERN_CRITERIA = {
  none: "No material concern. The file looks in the right layer, verifiable, and locally contained.",
  layering: "UI / API / DB / domain / infra concerns look mixed or in the wrong home.",
  blast_radius: "A change here would likely break distant callers or modules.",
  verification: "Behavior looks untested, hard to verify, or has no nearby tests.",
  security: "Secrets, tokens, or unsafe logging of sensitive data.",
  performance: "Obvious inefficiency (N+1, unbounded work, sync on a hot path) when indicated.",
  abstraction: "Unused indirection or speculative frameworky glue.",
  other: "A real concern that is not layering, blast radius, verification, security, performance, or abstraction.",
} as const;

function singleFileMode(state: Record<string, unknown>): boolean {
  return typeof state.path === "string" && state.path.trim().length > 0;
}

function hotspotQuestion(state: Record<string, unknown>): PackQuestion {
  const files = readStringCatalog(state.files);
  return {
    type: "choice",
    id: "hotspot_file",
    instructions:
      "Which path in the closed `files[]` catalog is the hottest follow-up? Options are only those paths (plus `none`). Do not invent a path. Use `batch_notes` and any `signals` — not file bodies. Orchestration stays in the caller.",
    criteria: stringCatalogChoiceCriteria(
      files,
      "No single file stands out; treat the batch as a whole.",
      "files",
    ),
  };
}

function staticQuestions(): PackQuestion[] {
  return [
    {
      type: "noul",
      id: "wrong_layer",
      instructions:
        "Given `path`, `role_hint`, and `signals` (and `excerpt` only if present), do UI / API / DB / domain / infra concerns look mixed or in the wrong home?",
      criteria: {
        true: "Path, role_hint, or signals place a concern in the wrong layer, or mix layers.",
        false: "The file sits in a coherent layer, or layering is not indicated.",
      },
    },
    {
      type: "noul",
      id: "blast_radius",
      instructions:
        "Would a change here likely break distant callers or modules? Prefer `signals` (import_count, top_imports, complexity, money/auth). Use `excerpt` only if present.",
      criteria: {
        true: "Shared contracts, many imports, or cross-module coupling look likely.",
        false: "Impact looks local, or blast radius is not indicated.",
      },
    },
    {
      type: "noul",
      id: "missing_verification",
      instructions:
        "Does the file look untested or hard to verify? Use `signals.has_tests_nearby` as extra evidence, not the decision.",
      criteria: {
        true: "Important behavior has no nearby tests, or looks hard to verify.",
        false: "Verification looks adequate, or the file is not behavior (config, generated, docs).",
      },
    },
    {
      type: "noul",
      id: "secret_or_credential_risk",
      instructions:
        "Do `path` or `signals` (and `excerpt` only if present) indicate secrets, tokens, credentials, or unsafe logging of sensitive data?",
      criteria: {
        true: "Secrets or credential handling look present or leaked.",
        false: "No secret or credential risk is indicated.",
      },
    },
    {
      type: "noul",
      id: "inefficiency",
      instructions:
        "Is an obvious performance smell indicated by `signals` (loc, complexity_heuristic, import_count) or a short `excerpt` if present? Do not invent a perf issue from path alone. Missing excerpt is not a smell.",
      criteria: {
        true: "Signals or a short excerpt strongly indicate N+1, unbounded work, or sync on a hot path.",
        false: "No performance smell is indicated.",
      },
    },
    {
      type: "noul",
      id: "dead_or_premature_abstraction",
      instructions:
        "Do `path`, `role_hint`, and `signals` (complexity, top_imports) indicate unused indirection or speculative glue? Use `excerpt` only if present. Do not flag this just because excerpt is absent.",
      criteria: {
        true: "Extra layers, unused wrappers, or speculative abstraction are indicated.",
        false: "Abstraction looks justified or is not indicated.",
      },
    },
    {
      type: "score",
      id: "problem_severity",
      instructions:
        "How severe is the combined concern given the Nouls and `signals`? Use `excerpt` only if present (Pass 2 confirmation).",
      criteria: [
        "Clean: no material issue indicated.",
        "Local smell: contained, not a ship risk.",
        "Cross-cutting concern: shared contracts or several modules.",
        "Ship-blocker risk: security, data, or likely production break.",
      ],
    },
    {
      type: "score",
      id: "change_cost",
      instructions:
        "How expensive would it be to fix or refactor this safely, given `signals`, `path`, and `repo_context`? Use `excerpt` only if present.",
      criteria: [
        "Cheap local edit.",
        "One module; straightforward tests.",
        "Cross-cutting refactor.",
        "Risky platform-wide or hard-to-undo change.",
      ],
    },
    {
      type: "choice",
      id: "primary_concern",
      instructions:
        "What is the single primary concern? Closed set only. Pick `none` when the file is clean enough. Do not invent a tenth label.",
      criteria: { ...PRIMARY_CONCERN_CRITERIA },
    },
  ];
}

function questionsForState(state: Record<string, unknown>): PackQuestion[] {
  const questions = staticQuestions();
  if (singleFileMode(state)) {
    return questions;
  }
  return [...questions, hotspotQuestion(state)];
}

function enforceBoundedString(
  state: Record<string, unknown>,
  field: string,
  maxChars: number,
  hint: string,
): void {
  const value = state[field];
  if (typeof value !== "string" || value.length <= maxChars) {
    return;
  }
  throw new ToolError(
    "invalid_state",
    `code_audit ${field} is ${value.length} chars; max ${maxChars}. ${hint}`,
    { field, max_chars: maxChars, actual_chars: value.length },
  );
}

function enforceCodeAuditState(state: Record<string, unknown>): void {
  enforceBoundedString(
    state,
    "excerpt",
    MAX_EXCERPT_CHARS,
    `Pass 1 is signals-only (milliseconds / RTT). Pass 2 sends a short excerpt on top-N files only. Truncate in the harness — this pack rejects large bodies.`,
  );
  enforceBoundedString(
    state,
    "repo_context",
    MAX_REPO_CONTEXT_CHARS,
    "Keep module purpose to one short line.",
  );
  enforceBoundedString(
    state,
    "batch_notes",
    MAX_BATCH_NOTES_CHARS,
    "Mode B is paths + a short note, not concatenated sources.",
  );

  const signals = state.signals;
  if (signals && typeof signals === "object" && !Array.isArray(signals)) {
    const imports = readStringCatalog((signals as Record<string, unknown>).top_imports);
    if (imports.length > MAX_TOP_IMPORTS) {
      throw new ToolError(
        "invalid_state",
        `code_audit signals.top_imports has ${imports.length} entries; max ${MAX_TOP_IMPORTS}. Send a short closed list of top import names.`,
        { field: "signals.top_imports", max_items: MAX_TOP_IMPORTS, actual_items: imports.length },
      );
    }
  }

  if (singleFileMode(state)) {
    return;
  }
  if (readStringCatalog(state.files).length > 0) {
    return;
  }
  throw new ToolError(
    "invalid_state",
    "code_audit needs Mode A (`path` + compact `signals`, preferred) or Mode B (`files[]` paths only). Do not send the whole repository as prose.",
  );
}

export const codeAuditPack: PackDefinition = {
  id: "code_audit",
  version: "1.0.0",
  title: "Code audit",
  summary:
    "Millisecond-tier per-file structured engineering audit: compact signals in, typed Nouls / Scores / primary_concern out. Latency is send/receive RTT per file — parallelize N workers. Pass 1 is signals-only over all files; Pass 2 adds a short excerpt on top-N only.",
  when_to_use:
    "When a harness already listed files and computed compact per-file signals and needs typed ratings — not a written review and not a multi-second LLM pass. Default: one run_pack per file with path + signals (no body). Distinct from review_diff (a short diff) and pr_audit (money/hours/migration merge). Compose gates in your code.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: {
        type: "string",
        description:
          "File under review. When set, Mode A (preferred): this call is about this one path. Wins over files[] if both are present.",
      },
      language: {
        type: "string",
        description: "Optional language id, e.g. ts, py, sql.",
      },
      role_hint: {
        type: "string",
        description:
          "Optional layer hint from the harness: ui | api | db | domain | infra | test | config | other.",
      },
      excerpt: {
        type: "string",
        description:
          `Pass 2 only. Optional short confirmation snippet, hard-capped at ${MAX_EXCERPT_CHARS} chars. Rejected if larger. Omit on Pass 1 (all-files scan).`,
      },
      signals: {
        type: "object",
        description:
          "Harness-computed heuristics. Pass 1 default evidence. Filter generated/vendor paths in the harness before calling.",
        additionalProperties: false,
        properties: {
          loc: { type: "number", description: "Lines of code in the file." },
          import_count: { type: "number", description: "Import / include count." },
          top_imports: {
            type: "array",
            description: `Optional short closed list of top import/module names (max ${MAX_TOP_IMPORTS}).`,
            items: { type: "string" },
          },
          has_tests_nearby: {
            type: "boolean",
            description: "Caller already thinks a sibling or colocated test exists.",
          },
          touches_money: {
            type: "boolean",
            description: "Caller already thinks billing, prices, payouts, or ledgers are in play.",
          },
          touches_auth: {
            type: "boolean",
            description: "Caller already thinks authn/authz is in play.",
          },
          is_generated: {
            type: "boolean",
            description: "Caller already thinks the file is generated. Prefer skipping these in the harness.",
          },
          complexity_heuristic: {
            type: "number",
            description: "Caller-computed complexity hint (any finite scale you document).",
          },
        },
      },
      repo_context: {
        type: "string",
        description: `Optional one-line module purpose (max ${MAX_REPO_CONTEXT_CHARS} chars). Not a repo dump.`,
      },
      files: {
        type: "array",
        description:
          "Mode B only: closed catalog of paths (no bodies). Ignored for question building when `path` is set. Jev only picks hotspot_file among these.",
        items: { type: "string" },
      },
      batch_notes: {
        type: "string",
        description: `Mode B: short batch note without file bodies (max ${MAX_BATCH_NOTES_CHARS} chars).`,
      },
    },
  },
  example_state: {
    path: "src/billing/invoice-total.ts",
    language: "ts",
    role_hint: "domain",
    signals: {
      loc: 12,
      import_count: 1,
      top_imports: ["money"],
      has_tests_nearby: false,
      touches_money: true,
      touches_auth: false,
      is_generated: false,
      complexity_heuristic: 2,
    },
    repo_context: "Billing module: invoice line totals.",
  },
  questions: staticQuestions(),
  questionsForState,
  enforceState: enforceCodeAuditState,
  suggested_workflow: [
    "Pass 1 (default, milliseconds): list files; filter screenshots, binaries, generated/vendor dirs; for every remaining file build path + language + role_hint + compact signals (no excerpt). Parallelize N workers — expect ~network RTT per file, not a multi-second review.",
    "One systemOne call per file returns the Nouls, problem_severity, change_cost, and primary_concern. Aggregate in code: top severity, most frequent high Nouls.",
    "Pass 2: only top-N severity/hotspot files get a second run_pack with a short excerpt (hard max 1200 chars) for confirmation. Do not excerpt the whole tree.",
    "Example gate: src/policy-examples.ts gateCodeAudit → ok | glance | deep_review.",
    "Optional Mode B: files[] paths + short batch_notes (no bodies) to pick hotspot_file. If path is also set, Mode A wins.",
  ],
  notes: [
    "Millisecond posture: compact signals in, typed answers out. Cost is send/receive RTT per file. Parallelize N workers. This is not a chat-model file review.",
    "Pass 1 (all files): path + signals, no excerpt. Pass 2 (top-N only): optional excerpt, hard-capped at 1200 chars — oversized excerpts are invalid_state, not silently truncated.",
    "Mode A (preferred): one file per run_pack. Mode B: files[] + batch_notes, Choice hotspot_file. When both path and files exist, single-file Mode A wins.",
    "The harness owns excerpt truncation. This pack rejects bodies over the cap. Screenshots, binaries, and generated/vendor dirs stay out.",
    "Thresholds live in caller code (gateCodeAudit is an example). Jev does not write a review comment or compute a repo-wide grade.",
    "Distinct from review_diff (short diff + files[] hotspot) and pr_audit (money/hours/migration merge).",
    "Noul answers have no separate confidence field — the probability is the belief. Choice and Score include probabilities plus confidence.",
  ],
};
