import type { PackDefinition } from "./types.js";

export const boundaryCheckPack: PackDefinition = {
  id: "boundary_check",
  version: "1.0.0",
  title: "Boundary check",
  summary:
    "Atomic layering judgment for one module: Nouls crosses_layer / leaks_domain_to_ui / leaks_infra_to_domain, Score boundary_risk, Choice fix (keep | extract | move_layer | unclear).",
  when_to_use:
    "When you already have a module’s import/export list and want a typed layering check. Prefer this over treating `code_audit.wrong_layer` as a refactor plan. Do not use Jev to move files or rewrite imports.",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["module", "imports", "exports"],
    properties: {
      module: {
        type: "string",
        description: "Path or name of the module under review.",
        minLength: 1,
      },
      imports: {
        type: "array",
        description: "Closed list of import paths or module names this file uses.",
        items: { type: "string" },
      },
      exports: {
        type: "array",
        description: "Closed list of exported names or paths.",
        items: { type: "string" },
      },
      layer_hint: {
        type: "string",
        description: "Optional caller layer, e.g. ui, domain, infra, application.",
      },
      change_summary: {
        type: "string",
        description: "Optional short note about what changed in this module.",
      },
    },
  },
  example_state: {
    module: "src/domain/catalog.ts",
    imports: ["src/ui/CatalogCard.tsx", "src/infra/postgres.ts"],
    exports: ["listCatalog"],
    layer_hint: "domain",
    change_summary: "Domain catalog list now imports a React card and a Postgres client.",
  },
  questions: [
    {
      type: "noul",
      id: "crosses_layer",
      instructions:
        "Given `module`, `imports`, `exports`, `layer_hint`, and `change_summary`, does this module mix or sit across layers (ui / domain / infra / application)?",
      criteria: {
        true: "Imports, exports, or the module path mix layers or sit in the wrong home.",
        false: "The module stays in one coherent layer, or layering is not indicated.",
      },
    },
    {
      type: "noul",
      id: "leaks_domain_to_ui",
      instructions:
        "Does this module leak domain rules or types into UI (or pull UI into a domain `layer_hint`)? Use `imports` and `exports`.",
      criteria: {
        true: "Domain logic is imported by UI, or UI widgets are imported by domain.",
        false: "Domain and UI stay separated, or one side is absent.",
      },
    },
    {
      type: "noul",
      id: "leaks_infra_to_domain",
      instructions:
        "Does this module leak infra (DB, HTTP client, filesystem, queue) into domain, or put domain rules inside infra? Use `imports`, `exports`, and `layer_hint`.",
      criteria: {
        true: "Infra adapters are imported by domain, or domain rules live in an infra module.",
        false: "Infra and domain stay separated, or one side is absent.",
      },
    },
    {
      type: "score",
      id: "boundary_risk",
      instructions:
        "How severe is the layering risk given the Nouls, `imports`, `exports`, and `layer_hint`?",
      criteria: [
        "Clean: imports and exports stay in the stated layer.",
        "Local smell: one questionable import, easy to fix.",
        "Cross-layer leak: domain / UI / infra mixed in this module.",
        "Systemic: the module is in the wrong layer or fans leaks outward.",
      ],
    },
    {
      type: "choice",
      id: "fix",
      instructions:
        "What is the smallest closed fix for this module? Pick one. Do not invent a fifth option. Orchestration (move files, extract modules) stays in the caller.",
      criteria: {
        keep: "Leave the module where it is; no layering fix needed.",
        extract: "Pull the leaked concern into its own module; keep this file’s layer.",
        move_layer: "Move this module to the layer it actually belongs in.",
        unclear: "Not enough state to pick a fix.",
      },
    },
  ],
  suggested_workflow: [
    "Collect `module`, the closed `imports[]` / `exports[]` lists, and an optional `layer_hint` / `change_summary` in code.",
    "list_packs / describe_pack once if unfamiliar, then run_pack boundary_check.",
    "Read the three Nouls first, then boundary_risk.score, then fix.choice.",
    "Apply extract / move / keep in the caller. Jev does not rewrite imports or move files.",
  ],
  notes: [
    "Signals only. Distinct from code_audit.wrong_layer (per-file scan). This pack judges one module’s import/export boundary.",
    "Thresholds live in caller code. Example: review if any leak Noul ≥ 0.65; treat as a hard look if boundary_risk.score ≥ 2.5 or crosses_layer.noul ≥ 0.75.",
    "Closed fix catalog. Fork the pack in-repo if you need another action name.",
  ],
};
