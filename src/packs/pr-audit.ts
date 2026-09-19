import type { PackDefinition } from "./types.js";

export const prAuditPack: PackDefinition = {
  id: "pr_audit",
  version: "1.0.0",
  title: "PR audit",
  summary:
    "Typed merge-risk judgment for a pull request. Staged review: risk Nouls (money/hours/boundary/migration) → closed-catalog file Choice from `files[]` in caller code → severity Score `blast_radius` (plus Choice `merge_risk`).",
  when_to_use:
    "Before merging or auto-approving a PR when you need calibrated risk signals. Use as a staged review workflow: gate on the risk Nouls first, then pick a hottest file from your closed `files[]` catalog in code if you need a file-level follow-up, then read `blast_radius` as severity. `merge_risk` stays the pack's merge Choice (not renamed). Do not use Jev to write the review comment or to compute the final gate.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "body", "files", "diff_summary"],
    properties: {
      title: { type: "string", description: "Pull request title." },
      body: { type: "string", description: "Pull request description. Empty string is allowed." },
      files: {
        type: "array",
        description: "Changed file paths.",
        items: { type: "string" },
      },
      diff_summary: {
        type: "string",
        description:
          "Short human or tool-written summary of the diff. Do not paste a huge raw patch; keep it to the intent and hotspots.",
      },
      flags: {
        type: "object",
        description:
          "Optional caller-computed heuristics. Jev still reads title/body/files/diff_summary; flags are extra evidence, not the decision.",
        additionalProperties: false,
        properties: {
          touches_money: {
            type: "boolean",
            description: "Caller already thinks billing, prices, payouts, or ledgers are in play.",
          },
          touches_hours: {
            type: "boolean",
            description: "Caller already thinks timesheets, time entries, or labor hours are in play.",
          },
          migration: {
            type: "boolean",
            description: "Caller already thinks a schema or data migration is in the change.",
          },
        },
      },
    },
  },
  example_state: {
    title: "Adjust overtime multiplier used in payroll export",
    body: "Updates the hours-to-pay conversion for weekly overtime and backfills last month's export rows.",
    files: [
      "apps/payroll/overtime.ts",
      "apps/payroll/export.ts",
      "db/migrations/2026_09_overtime_backfill.sql",
    ],
    diff_summary:
      "Changes overtime multiplier 1.5 → 1.75, writes a SQL backfill of payroll_export, and updates a UI label on the hours report.",
    flags: {
      touches_money: true,
      touches_hours: true,
      migration: true,
    },
  },
  questions: [
    {
      type: "choice",
      id: "merge_risk",
      instructions:
        "Given `title`, `body`, `files`, `diff_summary`, and `flags`, what is the merge risk of this pull request? Pick the option that matches the change, not the author's confidence.",
      criteria: {
        safe_ui:
          "Cosmetic or isolated UI/copy change. No money, hours, auth, persistence, or shared-contract impact.",
        needs_review:
          "Behavior or logic change that a human should review, but it is not an automatic block on its own.",
        block:
          "High-risk change that should not merge without explicit human approval: money, hours-to-pay, irreversible migration, security, or likely data loss.",
      },
    },
    {
      type: "noul",
      id: "money",
      instructions:
        "Does this change affect money — charges, payouts, invoices, prices, wallets, tax, or financial totals? Use `flags.touches_money`, `title`, `body`, `files`, and `diff_summary`.",
      criteria: {
        true: "The diff or description changes how money is calculated, stored, displayed as a total, or moved.",
        false: "Any money mention is incidental (copy, docs) or absent.",
      },
    },
    {
      type: "noul",
      id: "hours",
      instructions:
        "Does this change affect tracked hours, time entries, timesheets, attendance, or labor hours? Use `flags.touches_hours`, `title`, `body`, `files`, and `diff_summary`.",
      criteria: {
        true: "The change reads, writes, or redefines how hours are captured or aggregated.",
        false: "Hours are not part of the behavior change.",
      },
    },
    {
      type: "noul",
      id: "hours_money_boundary",
      instructions:
        "Does this change sit on the boundary between hours and money — converting time to pay, billing hours, overtime, cost rates, or mixing labor and charges? Use `flags`, `title`, `body`, `files`, and `diff_summary`.",
      criteria: {
        true: "Hours are used to compute money, or money rules change how hours are valued.",
        false: "Hours and money, if present at all, stay in separate concerns.",
      },
    },
    {
      type: "noul",
      id: "migration",
      instructions:
        "Does this change include a data or schema migration, backfill, or irreversible store change? Use `flags.migration`, `files`, and `diff_summary`.",
      criteria: {
        true: "A migration, backfill, destructive DDL, or one-way data rewrite is in the change.",
        false: "No migration or irreversible store rewrite is indicated.",
      },
    },
    {
      type: "score",
      id: "blast_radius",
      instructions:
        "How wide is the blast radius of this change given `files`, `diff_summary`, and `flags`?",
      criteria: [
        "Isolated: one surface, easy rollback, no shared contracts.",
        "Contained: a few related modules or APIs; rollback is straightforward.",
        "Cross-cutting: many services, shared contracts, or user-visible data.",
        "Systemic: platform-wide or irreversible impact.",
      ],
    },
  ],
  suggested_workflow: [
    "Collect title, body, changed paths, and a short diff_summary in code. Do not dump a full mega-diff into state.",
    "Optionally set flags from path heuristics (billing/, migrations/, timesheet/) before the call.",
    "Call list_packs / describe_pack once if you have not used pr_audit in this session, then run_pack.",
    "Stage in code: (1) risk Nouls — money, hours, hours_money_boundary, migration; (2) if you need a file-level follow-up, Choice among the closed `files[]` catalog you already passed (this pack does not invent paths); (3) severity via blast_radius.score. Read merge_risk.choice in the same snap.",
    "Compute code_gate in the caller. Jev does not return code_gate and must not be asked for it through this MCP.",
    "Apply side effects (block merge, request review, post a comment) in your code or host tools — never inside mcp_jev.",
  ],
  notes: [
    "Staged review is caller-owned: risk Nouls → file Choice over `files[]` → severity Score. This pack already fans out the Nouls, merge_risk, and blast_radius in one systemOne call; compose the file Choice in your code from the same `files[]` list (closed catalog).",
    "code_gate is computed by the caller, not Jev. Example: block if merge_risk is block, or money.noul is high, or hours_money_boundary.noul is high, or migration.noul is high with blast_radius.score >= 2. Tune thresholds on your own data.",
    "Noul answers have no separate confidence field — the probability is the belief.",
    "Choice and Score include probabilities plus confidence (how peaked the distribution is).",
  ],
};
