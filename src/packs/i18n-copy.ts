import { ToolError } from "../errors.js";
import { MAX_CHOICE_OPTIONS, NONE_OPTION, UNAVAILABLE_OPTION } from "./catalog-choice.js";
import type { PackDefinition, PackQuestion } from "./types.js";

/** Caller truncates. This pack rejects larger catalogs. */
export const MAX_I18N_CANDIDATES = 20;
export const MAX_CANDIDATE_TEXT = 240;
export const MAX_I18N_NOTES = 280;

export const I18N_LANGUAGES = ["tsx", "jsx", "vue", "svelte"] as const;
export const I18N_FRAMEWORKS = ["next-intl", "i18next", "react-intl", "lingui", "none", "unknown"] as const;
export const I18N_CANDIDATE_KINDS = [
  "jsx_text",
  "jsx_attr",
  "string_literal",
  "toast",
  "schema_message",
] as const;

export type I18nCandidateKind = (typeof I18N_CANDIDATE_KINDS)[number];

export type I18nCopyCandidate = {
  id: string;
  text: string;
  kind: I18nCandidateKind;
  line?: number;
};

const PRIMARY_BUCKET_CRITERIA = {
  ui_copy: "Visible labels, buttons, headings, placeholders, or empty states.",
  error_message: "Errors, toasts, validation, or schema messages shown to users.",
  marketing: "Hero, tagline, landing, or promotional copy.",
  dev_only: "Logs, test fixtures, identifiers, or comments — not shipped UI.",
  mixed: "More than one of the above; no single winner.",
  none: "No user-facing hardcoded copy in `candidates`.",
} as const;

const TEMPLATE_CANDIDATE_CRITERIA = {
  [NONE_OPTION]: "No single candidate stands out to extract first.",
  [UNAVAILABLE_OPTION]:
    "Placeholder in describe_pack. At run_pack this key is replaced by one option per closed `candidates[].id` (or kept if the catalog is empty).",
};

function isCandidateKind(value: unknown): value is I18nCandidateKind {
  return typeof value === "string" && (I18N_CANDIDATE_KINDS as readonly string[]).includes(value);
}

function isCopyCandidate(value: unknown): value is I18nCopyCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.trim().length === 0) {
    return false;
  }
  if (typeof item.text !== "string" || item.text.trim().length === 0) {
    return false;
  }
  if (!isCandidateKind(item.kind)) {
    return false;
  }
  if (item.line !== undefined && (typeof item.line !== "number" || !Number.isFinite(item.line))) {
    return false;
  }
  return true;
}

export function readCopyCandidates(value: unknown): I18nCopyCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isCopyCandidate);
}

function formatCandidate(item: I18nCopyCandidate): string {
  const parts = [`kind=${item.kind}`, `text=${item.text}`];
  if (item.line !== undefined) {
    parts.push(`line=${item.line}`);
  }
  return parts.join("; ");
}

function candidateChoiceCriteria(candidates: I18nCopyCandidate[]): Record<string, string> {
  if (candidates.length === 0) {
    return {
      [NONE_OPTION]: "No single candidate stands out to extract first.",
      [UNAVAILABLE_OPTION]: "Empty `candidates` catalog; pass a closed list (caller truncates to ~20) or pick `none`.",
    };
  }
  if (candidates.length > MAX_I18N_CANDIDATES) {
    throw new ToolError(
      "invalid_state",
      `candidates has ${candidates.length} items; max ${MAX_I18N_CANDIDATES}. Truncate in the caller.`,
      { field: "candidates", max_items: MAX_I18N_CANDIDATES, actual_items: candidates.length },
    );
  }
  if (candidates.length + 1 > MAX_CHOICE_OPTIONS) {
    throw new ToolError(
      "invalid_state",
      `candidates has ${candidates.length} items; TypeSafe Choice allows at most ${MAX_CHOICE_OPTIONS - 1} plus "${NONE_OPTION}".`,
    );
  }

  const seen = new Set<string>();
  const criteria: Record<string, string> = {
    [NONE_OPTION]: "No single candidate stands out to extract first.",
  };
  for (const item of candidates) {
    if (item.id === NONE_OPTION || item.id === UNAVAILABLE_OPTION) {
      throw new ToolError(
        "invalid_state",
        `candidates id "${item.id}" is reserved. Use another id; keep "${NONE_OPTION}" / "${UNAVAILABLE_OPTION}" for pack-owned options.`,
      );
    }
    if (seen.has(item.id)) {
      throw new ToolError("invalid_state", `candidates has duplicate id "${item.id}". Catalog ids must be unique.`);
    }
    seen.add(item.id);
    criteria[item.id] = formatCandidate(item);
  }
  return criteria;
}

function hottestCandidateQuestion(state: Record<string, unknown>): PackQuestion {
  const candidates = readCopyCandidates(state.candidates);
  return {
    type: "choice",
    id: "hottest_candidate",
    instructions:
      "Which `candidates[].id` is the hottest string to extract first? Options are only those ids (plus `none`). Prefer user-visible UI or error copy over logs. Do not invent an id. Extraction stays in the caller.",
    criteria: candidateChoiceCriteria(candidates),
  };
}

function staticQuestions(): PackQuestion[] {
  return [
    {
      type: "noul",
      id: "has_user_facing_hardcoded_copy",
      instructions:
        "Given `path`, `candidates`, and `uses_i18n_api`, does this file contain user-facing hardcoded copy (visible UI text, errors, toasts, or schema messages) that is not already going through an i18n API?",
      criteria: {
        true: "At least one candidate is user-visible copy that would ship in one language.",
        false: "Candidates are identifiers, logs, tests, or already passed through t() / useTranslations / equivalent.",
      },
    },
    {
      type: "noul",
      id: "should_migrate_to_i18n",
      instructions:
        "Should the caller extract the user-facing strings in `candidates` into the project's i18n layer (`framework_i18n`, `locale_files_present`) before a multi-locale ship?",
      criteria: {
        true: "Hardcoded user-facing copy should move to locale files / t() before shipping more locales.",
        false: "No migration needed: already i18n, copy is dev-only, or a multi-locale ship is not indicated.",
      },
    },
    {
      type: "noul",
      id: "already_partially_internationalized",
      instructions:
        "Is this file already partly on the i18n path? Use `uses_i18n_api`, `framework_i18n`, and `locale_files_present` as evidence — some strings via t() / useTranslations while others remain hardcoded.",
      criteria: {
        true: "The file or repo already calls an i18n API or has locale files, but coverage is incomplete.",
        false: "No i18n API in play, the file is fully migrated, or there is nothing to migrate.",
      },
    },
    {
      type: "score",
      id: "i18n_debt",
      instructions:
        "How much i18n debt does this file add to a multi-locale ship, given `candidates`, `uses_i18n_api`, and `framework_i18n`?",
      criteria: [
        "Clean: no user-facing hardcoded copy.",
        "Local leftover: a few strings, easy extract.",
        "Cross-cutting: many strings or mixed buckets; needs a focused pass.",
        "Blocking for a multi-locale ship: user-facing copy would ship untranslated.",
      ],
    },
    {
      type: "choice",
      id: "hottest_candidate",
      instructions:
        "Which `candidates[].id` is the hottest extract? run_pack builds options from the closed `candidates` catalog.",
      criteria: { ...TEMPLATE_CANDIDATE_CRITERIA },
    },
    {
      type: "choice",
      id: "primary_bucket",
      instructions:
        "What is the single primary bucket for the copy in `candidates`? Closed set only. Pick `none` when there is no user-facing hardcoded copy. Do not invent a seventh label.",
      criteria: { ...PRIMARY_BUCKET_CRITERIA },
    },
  ];
}

function enforceI18nCopyState(state: Record<string, unknown>): void {
  const notes = state.notes;
  if (typeof notes === "string" && notes.length > MAX_I18N_NOTES) {
    throw new ToolError(
      "invalid_state",
      `i18n_copy notes is ${notes.length} chars; max ${MAX_I18N_NOTES}. Keep it to one short line.`,
      { field: "notes", max_chars: MAX_I18N_NOTES, actual_chars: notes.length },
    );
  }

  const raw = state.candidates;
  if (!Array.isArray(raw)) {
    return;
  }
  if (raw.length > MAX_I18N_CANDIDATES) {
    throw new ToolError(
      "invalid_state",
      `i18n_copy candidates has ${raw.length} items; max ${MAX_I18N_CANDIDATES}. Truncate in the caller — this pack rejects larger catalogs.`,
      { field: "candidates", max_items: MAX_I18N_CANDIDATES, actual_items: raw.length },
    );
  }
}

export const i18nCopyPack: PackDefinition = {
  id: "i18n_copy",
  version: "1.0.0",
  title: "i18n copy",
  summary:
    "Per-file hardcoded UI-copy audit: closed `candidates[]` in, Nouls for user-facing copy / migrate / already-partial, Score i18n_debt (0 clean → 3 blocking), Choice hottest_candidate from the catalog plus none, Choice primary_bucket.",
  when_to_use:
    "When a harness already extracted a short closed list of likely hardcoded strings from a UI file (tsx/jsx/vue/svelte) and needs a typed judgment — not a written rewrite and not a locale-file edit. Distinct from `code_audit` (engineering structure) and `review_diff` (diff risk). Compose the extract/block gate in your code (`gateI18nCopy`).",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["path", "uses_i18n_api", "candidates"],
    properties: {
      path: {
        type: "string",
        description: "File under review (one file per run_pack).",
        minLength: 1,
      },
      language: {
        type: "string",
        description: "Optional UI language id.",
        enum: [...I18N_LANGUAGES],
      },
      framework_i18n: {
        type: "string",
        description: "Optional i18n library the repo already uses, or `none` / `unknown`.",
        enum: [...I18N_FRAMEWORKS],
      },
      uses_i18n_api: {
        type: "boolean",
        description: "Caller already thinks this file calls t() / useTranslations / equivalent.",
      },
      candidates: {
        type: "array",
        description: `Closed catalog of likely hardcoded strings. Caller truncates (max ${MAX_I18N_CANDIDATES}). Jev only picks hottest_candidate among these ids plus none.`,
        maxItems: MAX_I18N_CANDIDATES,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "text", "kind"],
          properties: {
            id: {
              type: "string",
              description: "Stable caller id. Must be unique. Reserved: none, unavailable.",
              minLength: 1,
            },
            text: {
              type: "string",
              description: `The hardcoded string as extracted (max ${MAX_CANDIDATE_TEXT} chars).`,
              minLength: 1,
              maxLength: MAX_CANDIDATE_TEXT,
            },
            kind: {
              type: "string",
              description: "Where the string sits in the file.",
              enum: [...I18N_CANDIDATE_KINDS],
            },
            line: {
              type: "number",
              description: "Optional 1-based line number.",
            },
          },
        },
      },
      locale_files_present: {
        type: "boolean",
        description: "Caller already thinks the repo has locale / messages files.",
      },
      notes: {
        type: "string",
        description: `Optional one-line context (max ${MAX_I18N_NOTES} chars). Not a file dump.`,
        maxLength: MAX_I18N_NOTES,
      },
    },
  },
  example_state: {
    path: "src/components/LoginForm.tsx",
    language: "tsx",
    framework_i18n: "next-intl",
    uses_i18n_api: false,
    locale_files_present: true,
    candidates: [
      { id: "login_heading", text: "Login", kind: "jsx_text", line: 12 },
      { id: "submit_btn", text: "Submit", kind: "jsx_attr", line: 40 },
      { id: "load_error", text: "Error loading", kind: "toast", line: 55 },
    ],
    notes: "Login form. Locale files exist; this file does not call t() yet.",
  },
  questions: staticQuestions(),
  questionsForState: (state) =>
    staticQuestions().map((question) =>
      question.id === "hottest_candidate" ? hottestCandidateQuestion(state) : question,
    ),
  enforceState: enforceI18nCopyState,
  suggested_workflow: [
    "In the harness, scan one UI file for likely hardcoded strings. Build a closed candidates[] catalog (id, text, kind, optional line). Truncate to ~20 — this pack rejects larger lists.",
    "Set uses_i18n_api from a cheap AST/grep (t(), useTranslations, FormattedMessage, msg). Set framework_i18n and locale_files_present if known.",
    "run_pack i18n_copy. Read Nouls has_user_facing_hardcoded_copy / should_migrate_to_i18n / already_partially_internationalized, then i18n_debt, then hottest_candidate (only from candidates[].id) and primary_bucket.",
    "Example gate: src/policy-examples.ts gateI18nCopy → ok | glance | block. Extract or block the multi-locale ship in the caller. Jev does not rewrite the file or edit locale JSON.",
  ],
  notes: [
    "hottest_candidate options are the closed candidates[].id catalog plus none. The MCP does not invent ids. Caller truncates to max 20.",
    "Thresholds live in caller code (gateI18nCopy is an example). Jev does not extract strings, write locale files, or compute a repo-wide i18n grade.",
    "Distinct from code_audit (engineering structure) and review_diff (diff risk). Use this pack when the question is hardcoded UI copy vs i18n.",
    "Noul answers have no separate confidence field — the probability is the belief. Choice and Score include probabilities plus confidence.",
  ],
};
