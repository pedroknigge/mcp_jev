import { ToolError } from "../errors.js";
import { readStringCatalog, stringCatalogChoiceCriteria } from "./catalog-choice.js";
import type { PackDefinition, PackQuestion } from "./types.js";

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
        "Given `path`, `role_hint`, `excerpt`, `repo_context`, and `signals`, do UI / API / DB / domain / infra concerns look mixed or in the wrong home?",
      criteria: {
        true: "The excerpt or path places a concern in the wrong layer, or mixes layers in one unit.",
        false: "The file sits in a coherent layer, or layering is not indicated.",
      },
    },
    {
      type: "noul",
      id: "blast_radius",
      instructions:
        "Would a change to this file (or batch) likely break distant callers or modules? Use `signals` (imports, complexity, money/auth flags) and `excerpt` / `batch_notes` as extra evidence, not the decision.",
      criteria: {
        true: "Shared contracts, many importers, or cross-module coupling look likely.",
        false: "Impact looks local, or blast radius is not indicated.",
      },
    },
    {
      type: "noul",
      id: "missing_verification",
      instructions:
        "Does the behavior look untested, hard to verify, or lacking nearby tests? Use `signals.has_tests_nearby` as extra evidence, not the decision.",
      criteria: {
        true: "Important behavior has no nearby tests, or looks hard to verify.",
        false: "Verification looks adequate, or the file is not behavior (config, generated, docs).",
      },
    },
    {
      type: "noul",
      id: "secret_or_credential_risk",
      instructions:
        "Do `excerpt`, `path`, or `signals` indicate secrets, tokens, credentials, or unsafe logging of sensitive data?",
      criteria: {
        true: "Secrets or credential handling look present or leaked.",
        false: "No secret or credential risk is indicated.",
      },
    },
    {
      type: "noul",
      id: "inefficiency",
      instructions:
        "Is there an obvious performance smell (N+1, unbounded loop, sync on a hot path) when `excerpt` or `signals` indicate it? Do not invent a perf issue from path alone.",
      criteria: {
        true: "An inefficiency is visible in the excerpt or strongly indicated by signals.",
        false: "No performance smell is indicated, or there is not enough excerpt to tell.",
      },
    },
    {
      type: "noul",
      id: "dead_or_premature_abstraction",
      instructions:
        "Does the excerpt show unused indirection or speculative frameworky glue that is not earning its keep?",
      criteria: {
        true: "Extra layers, unused wrappers, or speculative abstraction are indicated.",
        false: "Abstraction looks justified or is not indicated.",
      },
    },
    {
      type: "score",
      id: "problem_severity",
      instructions:
        "How severe is the combined concern given the Nouls, `excerpt` / `batch_notes`, and `signals`?",
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
        "How expensive would it be to fix or refactor this safely, given `excerpt`, `signals`, and `repo_context`?",
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

function enforceCodeAuditState(state: Record<string, unknown>): void {
  if (singleFileMode(state)) {
    if (typeof state.excerpt !== "string") {
      throw new ToolError(
        "invalid_state",
        "code_audit single-file mode (`path` set) requires `excerpt` (string). The harness truncates; Jev does not receive the whole repo.",
      );
    }
    return;
  }
  if (readStringCatalog(state.files).length > 0) {
    return;
  }
  throw new ToolError(
    "invalid_state",
    "code_audit needs Mode A (`path` + `excerpt`, preferred: one file per run_pack) or Mode B (`files[]` paths only). Do not send the whole repository as prose.",
  );
}

export const codeAuditPack: PackDefinition = {
  id: "code_audit",
  version: "1.0.0",
  title: "Code audit",
  summary:
    "Per-file structured engineering audit: Nouls for layering / blast-radius / verification / secrets / inefficiency / abstraction, Scores problem_severity + change_cost, Choice primary_concern. Optional Mode B: hotspot_file from a closed files[] catalog. Harness fans out for 100% coverage — Jev never sees the whole repo as prose.",
  when_to_use:
    "When a harness already listed files and built a closed per-file (or per-chunk) state and needs typed ratings — not a written review. Prefer one run_pack per file (path + truncated excerpt + signals). Do not dump a monorepo into state. Distinct from review_diff (a short diff) and pr_audit (money/hours/migration merge). Compose gates in your code.",
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
          "Caller-truncated file text (e.g. ≤4k chars). The harness owns truncation and chunking. Required in Mode A (`path` set). Do not send binaries.",
      },
      signals: {
        type: "object",
        description:
          "Optional harness-computed heuristics. Extra evidence, not the decision. Filter generated/vendor paths in the harness before calling.",
        additionalProperties: false,
        properties: {
          loc: { type: "number", description: "Lines of code in the file or chunk." },
          import_count: { type: "number", description: "Import / include count." },
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
        description: "Optional short module purpose. Not a repo dump.",
      },
      files: {
        type: "array",
        description:
          "Mode B only: closed catalog of paths (no bodies). Ignored for question building when `path` is set. Jev only picks hotspot_file among these.",
        items: { type: "string" },
      },
      batch_notes: {
        type: "string",
        description:
          "Mode B: short batch summary without file bodies. Do not paste concatenated sources.",
      },
    },
  },
  example_state: {
    path: "src/billing/invoice-total.ts",
    language: "ts",
    role_hint: "domain",
    excerpt:
      "export function invoiceTotal(lines: { price: number; qty: number }[]) {\n  return lines.reduce((sum, line) => sum + line.price * line.qty, 0);\n}\n",
    signals: {
      loc: 12,
      import_count: 0,
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
    "Harness lists files for 100% coverage. Filter screenshots, binaries, and generated/vendor dirs before any run_pack.",
    "Mode A (preferred): for each remaining file, build a closed state — path, optional language/role_hint/signals/repo_context, and a truncated excerpt (caller owns the cap, e.g. ≤4k chars or chunk and call again).",
    "Fan out parallel run_pack code_audit calls. Never concatenate the monorepo into one state blob.",
    "Read Nouls first (wrong_layer, blast_radius, missing_verification, secret_or_credential_risk, inefficiency, dead_or_premature_abstraction), then problem_severity / change_cost, then primary_concern.",
    "Aggregate in code: top problem_severity, most frequent high Nouls, files whose primary_concern is not none. Example gate: src/policy-examples.ts gateCodeAudit → ok | glance | deep_review.",
    "Optional Mode B: one call with files[] paths plus short batch_notes (no bodies) to pick hotspot_file. If path is also set, Mode A wins and hotspot_file is not asked.",
  ],
  notes: [
    "Jev must not receive the whole repository as prose. 100% file coverage is a harness fan-out: list → filter → truncate → parallel run_pack → aggregate.",
    "Mode A (preferred v1): path + excerpt + optional signals. Mode B: files[] + batch_notes, Choice hotspot_file from the closed files[] catalog. When both path and files exist, single-file Mode A wins.",
    "The caller owns excerpt truncation and chunking. This pack does not slice files.",
    "Screenshots, pixels, image blobs, and binaries stay out of state. Generated and vendor directories should be filtered by the harness, not sent with is_generated as a substitute for skipping.",
    "Thresholds live in caller code (gateCodeAudit is an example). Jev does not write a review comment or compute a repo-wide grade.",
    "Distinct from review_diff (short diff + files[] hotspot) and pr_audit (money/hours/migration merge).",
    "Noul answers have no separate confidence field — the probability is the belief. Choice and Score include probabilities plus confidence.",
  ],
};
