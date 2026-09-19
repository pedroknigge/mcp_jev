import type { PackDefinition, PackQuestion } from "./types.js";
import {
  catalogChoiceCriteria,
  NONE_OPTION,
  readCatalogItems,
  UNAVAILABLE_OPTION,
} from "./catalog-choice.js";
import { buildComputerUseGuidance, rejectScreenshotState } from "./computer-use-guidance.js";

const OPERATION_CRITERIA = {
  click_item: "Click one visible catalog item (`click_target`).",
  type_text: "Type free text into a field (`type_target`). The harness / writer LLM supplies the string — Jev does not write it.",
  type_email: "Type an email into a field (`type_target`). The harness / writer LLM supplies the address.",
  press_enter: "Press Enter / submit. No item target.",
  press_escape: "Press Escape / dismiss. No item target.",
  scroll_up: "Scroll up to reveal more content. No item target.",
  scroll_down: "Scroll down to reveal more content. No item target.",
  use_browser: "Switch to or invoke the browser / webview tool. No item target.",
  press_offscreen: "Act on a known off-screen item (`offscreen_target`).",
  wait: "Observation is mid-transition or loading; wait and re-observe.",
  done: "The goal is complete; stop the harness loop.",
  none: "No GUI action this step, or nothing in the closed catalogs fits.",
} as const;

const TEMPLATE_TARGET_CRITERIA = {
  [NONE_OPTION]: "Do not target an item.",
  [UNAVAILABLE_OPTION]:
    "Placeholder in describe_pack. At run_pack this key is replaced by one option per closed-catalog id (or kept if the catalog is empty).",
};

const itemSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["id", "role", "label"],
  properties: {
    id: {
      type: "string",
      description: "Stable closed-catalog id from the harness (OCR / AX / DOM). Not invented by Jev.",
      minLength: 1,
    },
    role: {
      type: "string",
      description: "Control role, e.g. button, textfield, link, cell.",
      minLength: 1,
    },
    label: {
      type: "string",
      description: "Visible or AX label. Keep short.",
      minLength: 1,
    },
    name: { type: "string", description: "Optional accessible name if different from label." },
    value: { type: "string", description: "Optional current value (empty string if blank)." },
    state: { type: "string", description: "Optional control state, e.g. focused, disabled, selected, expanded." },
    region: { type: "string", description: "Optional region/section, e.g. toolbar, dialog, list." },
    source: { type: "string", description: "Optional origin, e.g. ax, ocr, dom, compose." },
  },
};

function targetQuestions(state: Record<string, unknown>): PackQuestion[] {
  const items = readCatalogItems(state.items);
  const offscreen = readCatalogItems(state.offscreen_items);
  const clickCriteria = catalogChoiceCriteria(
    items,
    "Do not click an on-screen item (this step is not click_item).",
    "items",
  );
  const typeCriteria = catalogChoiceCriteria(
    items,
    "Do not type into an on-screen item (this step is not type_text / type_email).",
    "items",
  );
  const offscreenCriteria = catalogChoiceCriteria(
    offscreen,
    "Do not act on an off-screen item (this step is not press_offscreen).",
    "offscreen_items",
  );

  return [
    operationQuestion(),
    {
      type: "choice",
      id: "click_target",
      instructions:
        "Assume `operation` is `click_item` (this question is independent of the operation Choice). Which `items[].id` should be clicked? Options are the closed catalog in `items` (plus `none`). The harness uses this answer ONLY when the operation Choice is `click_item`; ignore it otherwise.",
      criteria: clickCriteria,
    },
    {
      type: "choice",
      id: "type_target",
      instructions:
        "Assume `operation` is `type_text` or `type_email` (this question is independent of the operation Choice). Which `items[].id` should receive text? Options are the closed catalog in `items` (plus `none`). Jev does not generate the typed string — a writer LLM in the harness does. The harness uses this answer ONLY for those operations.",
      criteria: typeCriteria,
    },
    {
      type: "choice",
      id: "offscreen_target",
      instructions:
        "Assume `operation` is `press_offscreen` (this question is independent of the operation Choice). Which `offscreen_items[].id` should be used? Options are the closed catalog in `offscreen_items` (plus `none`). The harness uses this answer ONLY when the operation Choice is `press_offscreen`.",
      criteria: offscreenCriteria,
    },
    ...sharedJudgments(),
  ];
}

function operationQuestion(): PackQuestion {
  return {
    type: "choice",
    id: "operation",
    instructions:
      "Given `goal`, `app_or_url`, `observation_summary`, `focused_field`, `items`, `offscreen_items`, `history`, and `flags`, what is the single next GUI operation? Options are mutually exclusive. Do not invent an operation outside this catalog. Prefer `wait` when `flags.loading` or the observation looks mid-transition. Prefer `done` only when the goal is already visible as complete.",
    criteria: { ...OPERATION_CRITERIA },
  };
}

function sharedJudgments(): PackQuestion[] {
  return [
    {
      type: "noul",
      id: "goal_achieved",
      instructions:
        "Given `goal` and `observation_summary` (and `history` if present), is the goal already achieved? Ask even when `operation` is not `done`.",
      criteria: {
        true: "The observation shows the goal is done; the harness should stop.",
        false: "Work remains, or the observation does not show completion.",
      },
    },
    {
      type: "noul",
      id: "observation_stale",
      instructions:
        "Is this observation likely stale, incomplete, or contradicted by `history` / `flags` (loading, modal just opened, last action had no effect)?",
      criteria: {
        true: "Re-observe before acting; the catalog or summary is not trustworthy.",
        false: "The observation is current enough to act on.",
      },
    },
    {
      type: "score",
      id: "step_confidence",
      instructions:
        "How confident should the harness be executing the chosen `operation` (and matching target) from this state?",
      criteria: [
        "Do not act; observation is incomplete or contradictory.",
        "Weak; re-observe or ask the user / writer before acting.",
        "Adequate for a reversible action.",
        "Strong; safe to execute the chosen operation.",
      ],
    },
  ];
}

export const computerUseStepPack: PackDefinition = {
  id: "computer_use_step",
  version: "1.1.0",
  title: "Computer-use step",
  summary:
    "One observation → one decision for GUI / browser / mobile harnesses: Choice operation + speculative click/type/offscreen targets from the closed item catalog, Nouls goal_achieved / observation_stale, Score step_confidence. run_pack also returns additive `guidance` (ignore mismatched targets; writer LLM owns typed strings).",
  when_to_use:
    "When a harness already has structured screen state (OCR, accessibility tree, or DOM) and needs the next operation and target. Not for screenshots, not for writing the typed string, not for routing a chat utterance (`intent_router`) or picking a model lane (`model_router`).",
  state_schema: {
    type: "object",
    additionalProperties: false,
    required: ["goal", "app_or_url", "observation_summary", "items"],
    properties: {
      goal: {
        type: "string",
        description: "Plain-language goal for this session. Keep it one task.",
        minLength: 1,
      },
      app_or_url: {
        type: "string",
        description: "Foreground app name or page URL.",
        minLength: 1,
      },
      observation_summary: {
        type: "string",
        description:
          "Short structured description of what is on screen now. Text only — no screenshots, pixels, or image blobs.",
        minLength: 1,
      },
      focused_field: {
        type: "string",
        description: "Optional id or label of the focused field, if known.",
      },
      items: {
        type: "array",
        description:
          "Closed catalog of visible items. Jev only picks among these ids. Filter and cap in the harness (TypeSafe Choice ≤ 255 options including `none`).",
        items: itemSchema,
      },
      offscreen_items: {
        type: "array",
        description: "Optional closed catalog of known but not visible items (AX off-screen, scrolled away).",
        items: itemSchema,
      },
      history: {
        type: "array",
        description: "Recent harness actions (keep short, last few steps). Helps Jev avoid loops.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action"],
          properties: {
            action: { type: "string", description: "What the harness did, e.g. click_item, type_text, scroll_down." },
            target: { type: "string", description: "Optional item id that was targeted." },
            result: { type: "string", description: "Optional short outcome, e.g. focused, no_change, error." },
          },
        },
      },
      flags: {
        type: "object",
        description: "Optional caller-computed heuristics. Extra evidence, not the decision.",
        additionalProperties: false,
        properties: {
          modal_open: { type: "boolean", description: "A dialog or sheet is open." },
          loading: { type: "boolean", description: "The UI looks mid-transition." },
          login_required: { type: "boolean", description: "A login wall is visible." },
          keyboard_visible: { type: "boolean", description: "A software keyboard is up." },
          irreversible_ahead: {
            type: "boolean",
            description: "The next obvious control looks irreversible (pay, send, delete).",
          },
        },
      },
    },
  },
  example_state: {
    goal: "Sign in with the saved work account",
    app_or_url: "https://app.example.com/login",
    observation_summary:
      "Login form: email field empty and focused, password field empty, primary button Sign in, link Forgot password. No error banner.",
    focused_field: "email",
    items: [
      { id: "email", role: "textfield", label: "Work email", name: "email", value: "", state: "focused", region: "form", source: "ax" },
      { id: "password", role: "textfield", label: "Password", name: "password", value: "", state: "empty", region: "form", source: "ax" },
      { id: "sign_in", role: "button", label: "Sign in", name: "Sign in", state: "enabled", region: "form", source: "ax" },
      { id: "forgot", role: "link", label: "Forgot password", name: "Forgot password", region: "form", source: "dom" },
    ],
    offscreen_items: [{ id: "privacy", role: "link", label: "Privacy", region: "footer", source: "ax" }],
    history: [{ action: "wait", result: "form_visible" }],
    flags: { modal_open: false, loading: false, login_required: true, keyboard_visible: true },
  },
  questionsForState: targetQuestions,
  enforceState: rejectScreenshotState,
  decorateRunResult: ({ state, answers }) => ({
    guidance: buildComputerUseGuidance(state, answers),
  }),
  questions: [
    operationQuestion(),
    {
      type: "choice",
      id: "click_target",
      instructions:
        "Assume `operation` is `click_item` (independent question). Which `items[].id` should be clicked? run_pack builds options from the closed `items` catalog.",
      criteria: { ...TEMPLATE_TARGET_CRITERIA },
    },
    {
      type: "choice",
      id: "type_target",
      instructions:
        "Assume `operation` is `type_text` or `type_email` (independent question). Which `items[].id` should receive text? run_pack builds options from `items`. Jev does not write the string.",
      criteria: { ...TEMPLATE_TARGET_CRITERIA },
    },
    {
      type: "choice",
      id: "offscreen_target",
      instructions:
        "Assume `operation` is `press_offscreen` (independent question). Which `offscreen_items[].id` should be used? run_pack builds options from `offscreen_items`.",
      criteria: { ...TEMPLATE_TARGET_CRITERIA },
    },
    ...sharedJudgments(),
  ],
  suggested_workflow: [
    "Observe in code (OCR, accessibility tree, or DOM). Build `items[]` / `offscreen_items[]` with stable ids. Never put screenshots or image bytes in state.",
    "Pass `goal`, `app_or_url`, a short `observation_summary`, optional `focused_field`, recent `history`, and `flags`.",
    "run_pack computer_use_step. One systemOne call fans out operation + three target Choices + two Nouls + step_confidence. The MCP adds `guidance` (additive; answers stay the same).",
    "In code: if goal_achieved.noul is high and/or operation is done, stop. If observation_stale.noul is high or step_confidence is low, re-observe — do not act.",
    "Execute only the chosen operation. Prefer `guidance.effective_targets` and `guidance.ignore_targets`. For click_item use click_target; for type_* use type_target; for press_offscreen use offscreen_target. Ignore speculative targets that do not match operation.",
    "If operation is type_text or type_email, call a writer LLM (or a stored value) for the string. Jev does not generate text (`guidance.writer_owns_typed_string`).",
    "Stop rules, retries, and irreversible confirms stay in the harness. Append the action to history and loop.",
  ],
  notes: [
    "Harness contract (enforced): structured text state only. Screenshot / image keys and data-URI / long base64 blobs are invalid_state. Never put pixels in Jev state.",
    "Harness contract: ignore speculative targets that do not match `operation`. run_pack returns additive `guidance` with apply_* flags, ignore_targets, and effective_targets. Raw answers stay intact (schema-stable).",
    "Harness contract: the writer LLM (or a stored value) owns typed strings. Jev never writes type_text / type_email content.",
    "If required fields are missing, run_pack returns structured details.missing plus the same screenshots_forbidden / writer_owns_typed_string hint. Call describe_pack; do not guess.",
    "Code owns execution, OCR/AX/DOM, the writer LLM for free text, and stop rules. Jev only picks operation + target.",
    "Target Choices are speculative fan-out. The TypeSafe JS SDK accepts dynamic `choice(instructions, { [id]: description })` records; this pack builds those keys from `items[]` / `offscreen_items[]` at run_pack. Callers must pass a closed catalog — the MCP does not invent ids. If you cannot supply item ids, do not call this pack (do not send a screenshot instead).",
    "Reserved option ids: `none`, `unavailable`. Do not use them as item ids. TypeSafe Choice allows at most 255 options including `none`.",
    "Example thresholds (tune on your traces): stop if goal_achieved.noul ≥ 0.8 or operation is done; re-observe if observation_stale.noul ≥ 0.65 or step_confidence.score < 1.5; skip acting if operation.confidence < 0.45.",
    "Speculative fan-out is one systemOne call: Choice operation plus a separate target Choice per op. The harness uses ONLY the target matching the selected operation (`guidance.effective_targets` / `harness_hints`). Ignore the others.",
    "Each target question's premise names the assumed operation (questions are independent). Do not invent a combined target.",
    "max_steps / max_candidates live in the harness. This MCP does not loop, cap, or execute.",
  ],
};
