import { ToolError } from "../errors.js";
import { NONE_OPTION, UNAVAILABLE_OPTION } from "./catalog-choice.js";

const SCREENSHOT_KEYS = new Set([
  "screenshot",
  "screenshots",
  "image",
  "images",
  "image_base64",
  "image_data",
  "screenshot_b64",
  "pixels",
  "png",
  "jpeg",
  "jpg",
  "webp",
  "bitmap",
  "frame",
  "frames",
]);

const DATA_IMAGE_RE = /data:image\/[a-z0-9.+-]+;base64,/i;
const LONG_BASE64_RE = /(?:[A-Za-z0-9+/]{80}){4,}={0,2}/;

const TYPE_OPS = new Set(["type_text", "type_email"]);

export type ComputerUseGuidance = {
  contract: "computer_use_step_v1";
  operation: string | null;
  apply_click_target: boolean;
  apply_type_target: boolean;
  apply_offscreen_target: boolean;
  writer_owns_typed_string: boolean;
  ignore_targets: string[];
  effective_targets: {
    click_target: string | null;
    type_target: string | null;
    offscreen_target: string | null;
  };
  screenshots_forbidden: true;
  missing_optional: string[];
  harness_hints: string[];
};

export function computerUseMissingHint(): Record<string, unknown> {
  return {
    screenshots_forbidden: true,
    writer_owns_typed_string: true,
    hint:
      "Pass structured text only (goal, app_or_url, observation_summary, items[]). Never put screenshots or image blobs in state. Ignore speculative targets that do not match operation. The writer LLM owns typed strings.",
  };
}

export function rejectScreenshotState(state: Record<string, unknown>): void {
  const forbidden = Object.keys(state).filter((key) => SCREENSHOT_KEYS.has(key.toLowerCase()));
  if (forbidden.length > 0) {
    throw new ToolError(
      "invalid_state",
      `computer_use_step forbids screenshot/image fields (${forbidden.join(", ")}). Observe in the harness and pass structured text only.`,
      { ...computerUseMissingHint(), forbidden },
    );
  }
  const blobPaths = findImageBlobs(state, "/");
  if (blobPaths.length > 0) {
    throw new ToolError(
      "invalid_state",
      `computer_use_step forbids image/base64 blobs in state (${blobPaths.join(", ")}). Keep observation_summary as short text.`,
      { ...computerUseMissingHint(), forbidden: blobPaths },
    );
  }
}

export function buildComputerUseGuidance(
  state: unknown,
  answers: Record<string, unknown>,
): ComputerUseGuidance {
  const operation = readChoice(answers.operation);
  const applyClick = operation === "click_item";
  const applyType = TYPE_OPS.has(operation ?? "");
  const applyOffscreen = operation === "press_offscreen";
  const ignore_targets: string[] = [];
  if (!applyClick) {
    ignore_targets.push("click_target");
  }
  if (!applyType) {
    ignore_targets.push("type_target");
  }
  if (!applyOffscreen) {
    ignore_targets.push("offscreen_target");
  }

  return {
    contract: "computer_use_step_v1",
    operation,
    apply_click_target: applyClick,
    apply_type_target: applyType,
    apply_offscreen_target: applyOffscreen,
    writer_owns_typed_string: applyType,
    ignore_targets,
    effective_targets: {
      click_target: applyClick ? usableTarget(readChoice(answers.click_target)) : null,
      type_target: applyType ? usableTarget(readChoice(answers.type_target)) : null,
      offscreen_target: applyOffscreen ? usableTarget(readChoice(answers.offscreen_target)) : null,
    },
    screenshots_forbidden: true,
    missing_optional: missingOptional(state),
    harness_hints: [
      "Ignore speculative targets that do not match operation. Use only the target head for the selected op.",
      "Each target Choice assumes its operation; questions are independent — do not reconcile them yourself.",
      "Writer LLM (or a stored value) owns typed strings. Jev never invents type_text / type_email content.",
      "max_steps and max_candidates are harness-owned stop rules, not MCP side effects.",
      "Never put screenshots or image blobs in state. Pass an indexed closed catalog (role/label/region).",
    ],
  };
}

function readChoice(answer: unknown): string | null {
  if (!answer || typeof answer !== "object") {
    return null;
  }
  const choice = (answer as { choice?: unknown }).choice;
  return typeof choice === "string" && choice.length > 0 ? choice : null;
}

function usableTarget(choice: string | null): string | null {
  if (!choice || choice === NONE_OPTION || choice === UNAVAILABLE_OPTION) {
    return null;
  }
  return choice;
}

function missingOptional(state: unknown): string[] {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return ["focused_field", "offscreen_items", "history", "flags"];
  }
  const record = state as Record<string, unknown>;
  const missing: string[] = [];
  for (const key of ["focused_field", "offscreen_items", "history", "flags"] as const) {
    if (record[key] === undefined) {
      missing.push(key);
    }
  }
  return missing;
}

function findImageBlobs(value: unknown, path: string): string[] {
  if (typeof value === "string") {
    if (DATA_IMAGE_RE.test(value) || (value.length > 400 && LONG_BASE64_RE.test(value))) {
      return [path];
    }
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findImageBlobs(item, `${path}${path === "/" ? "" : "/"}${index}`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) =>
      findImageBlobs(child, path === "/" ? `/${key}` : `${path}/${key}`),
    );
  }
  return [];
}
