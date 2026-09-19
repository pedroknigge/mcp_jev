import { readStringCatalog, stringCatalogChoiceCriteria, NONE_OPTION, UNAVAILABLE_OPTION } from "./catalog-choice.js";
import type { PackDefinition, PackQuestion } from "./types.js";

const TEMPLATE_FILE_CRITERIA = {
  [NONE_OPTION]: "No single hotspot file.",
  [UNAVAILABLE_OPTION]:
    "Placeholder in describe_pack. At run_pack this key is replaced by one option per closed files[] path (or kept if the catalog is empty).",
};

function hotspotQuestion(state: Record<string, unknown>): PackQuestion {
  const files = readStringCatalog(state.files);
  return {
    type: "choice",
    id: "hotspot_file",
    instructions:
      "Which path in the closed `files[]` catalog is the hottest follow-up? Options are only those paths (plus `none`). Do not invent a path. Orchestration (open the file, request review, block merge) stays in the caller.",
    criteria: stringCatalogChoiceCriteria(
      files,
      "No single file stands out; treat the diff as a whole.",
      "files",
    ),
  };
}

function staticQuestions(): PackQuestion[] {
  return [
    {
      type: "noul",
      id: "correctness",
      instructions:
        "Given `diff_summary`, `files`, `intent`, and `flags`, does this change look likely to introduce a correctness bug (wrong logic, broken invariant, off-by-one, missed case)?",
      criteria: {
        true: "The described change risks incorrect behavior versus the stated intent.",
        false: "Correctness risk is low or not indicated.",
      },
    },
    {
      type: "noul",
      id: "security",
      instructions:
        "Does this change look likely to introduce a security issue (authz, injection, secrets, unsafe defaults)? Use `flags.touches_auth` as extra evidence, not the decision.",
      criteria: {
        true: "Security-sensitive behavior is in play or newly weakened.",
        false: "No security-sensitive change is indicated.",
      },
    },
    {
      type: "noul",
      id: "reliability",
      instructions:
        "Does this change look likely to hurt reliability (races, timeouts, retries, partial failure, crash paths)?",
      criteria: {
        true: "Failure handling or concurrency looks newly fragile.",
        false: "Reliability risk is low or not indicated.",
      },
    },
    {
      type: "noul",
      id: "compat",
      instructions:
        "Does this change look likely to break compatibility (API/ABI, schema, clients, flags)? Use `flags.touches_public_api` as extra evidence.",
      criteria: {
        true: "Callers or stored data may break.",
        false: "Compatibility risk is low or not indicated.",
      },
    },
    {
      type: "noul",
      id: "test_gap",
      instructions:
        "Is there a meaningful test gap for the described change? Use `flags.missing_tests_heuristic` as extra evidence, not the decision.",
      criteria: {
        true: "Behavior changed without matching tests, or tests look insufficient.",
        false: "Tests look adequate for the stated change, or the change is not behavior.",
      },
    },
    {
      type: "choice",
      id: "hotspot_file",
      instructions:
        "Which `files[]` path is the hottest follow-up? run_pack builds options from the closed `files` catalog.",
      criteria: { ...TEMPLATE_FILE_CRITERIA },
    },
    {
      type: "score",
      id: "severity",
      instructions: "How severe is the combined review risk given the Nouls and `diff_summary`?",
      criteria: [
        "Cosmetic or docs-only; no behavior risk.",
        "Local behavior change; easy rollback.",
        "Cross-cutting or user-visible; needs a careful review.",
        "High: security, data, or hard-to-undo impact.",
      ],
    },
  ];
}

export const reviewDiffPack: PackDefinition = {
  id: "review_diff",
  version: "1.0.0",
  title: "Review diff",
  summary:
    "Staged diff review: Nouls correctness / security / reliability / compat / test_gap, Choice hotspot_file from the closed files[] catalog, Score severity. Orchestration stays in the caller.",
  when_to_use:
    "When you already have a short diff summary and a closed list of changed paths and need typed review risks — not a written review comment. Compose gates in your code. Prefer this over `pr_audit` when the change is not framed as a money/hours/migration merge. Do not use Jev to post comments or compute the final gate.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["diff_summary", "files"],
    properties: {
      title: { type: "string", description: "Optional change title." },
      intent: {
        type: "string",
        description: "Optional one-line intended behavior. Helps the correctness Noul.",
      },
      diff_summary: {
        type: "string",
        description:
          "Short human or tool-written summary of the diff. Do not paste a huge raw patch.",
        minLength: 1,
      },
      files: {
        type: "array",
        description: "Closed catalog of changed paths. Jev only picks hotspot_file among these.",
        items: { type: "string" },
      },
      flags: {
        type: "object",
        description: "Optional caller-computed heuristics. Extra evidence, not the decision.",
        additionalProperties: false,
        properties: {
          touches_auth: {
            type: "boolean",
            description: "Caller already thinks authn/authz is in play.",
          },
          touches_public_api: {
            type: "boolean",
            description: "Caller already thinks a public contract changed.",
          },
          missing_tests_heuristic: {
            type: "boolean",
            description: "Caller already thinks tests are missing or thin.",
          },
        },
      },
    },
  },
  example_state: {
    title: "Reject empty catalog before targeting",
    intent: "Invalid item catalogs should fail closed before TypeSafe is called.",
    diff_summary:
      "Adds reserved-id checks on items[] and a unit test. No auth or schema change. Tests cover the new error path.",
    files: ["src/packs/catalog-choice.ts", "test/computer-use.test.ts"],
    flags: {
      touches_auth: false,
      touches_public_api: false,
      missing_tests_heuristic: false,
    },
  },
  questions: staticQuestions(),
  questionsForState: (state) => {
    const questions = staticQuestions();
    return questions.map((question) => (question.id === "hotspot_file" ? hotspotQuestion(state) : question));
  },
  suggested_workflow: [
    "Collect a short diff_summary and the closed files[] list in code. Do not dump a mega-diff.",
    "Optionally set flags from path heuristics (auth/, public API, missing tests) before the call.",
    "list_packs / describe_pack once if unfamiliar, then run_pack review_diff.",
    "Read the five risk Nouls first. Then hotspot_file.choice (only from files[]). Then severity.score.",
    "Compose the gate and any review comment in the caller. Jev does not post, merge, or compute code_gate.",
  ],
  notes: [
    "Staged review is caller-owned: risk Nouls → hotspot_file Choice over files[] → severity Score. This pack fans them out in one systemOne call.",
    "hotspot_file options are the closed files[] catalog plus none. The MCP does not invent paths.",
    "Thresholds live in caller code. Example: request review if any Noul ≥ 0.65; block if security.noul ≥ 0.75 or severity.score ≥ 2.5; open hotspot_file when it is not none.",
    "code_gate / comments / merges stay in the caller. Distinct from pr_audit (money/hours/migration merge risk).",
  ],
};
