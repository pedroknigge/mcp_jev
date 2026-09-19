import { MAX_CHOICE_OPTIONS } from "./packs/catalog-choice.js";
import type { PackQuestion } from "./packs/types.js";
import { ToolError } from "./errors.js";

const QUESTION_ID = /^[A-Za-z][A-Za-z0-9_]*$/;
const QUESTION_TYPES = new Set(["choice", "noul", "score"]);
const QUESTION_KEYS = new Set(["id", "type", "instructions", "criteria"]);
const NOUL_CRITERIA_KEYS = new Set(["true", "false"]);

export type CustomRunInput = {
  state: Record<string, unknown>;
  questions: PackQuestion[];
  model?: string;
};

export function parseCustomRunInput(input: {
  state?: unknown;
  questions?: unknown;
  model?: unknown;
}): CustomRunInput {
  if (input.state === undefined) {
    throw new ToolError(
      "invalid_arguments",
      "run_questions requires state (JSON object of caller-built evidence).",
    );
  }
  if (input.questions === undefined) {
    throw new ToolError(
      "invalid_arguments",
      "run_questions requires questions (array of typed Choice / Noul / Score items).",
    );
  }

  const state = parseState(input.state);
  const questions = parseQuestions(input.questions);
  const model = parseOptionalModel(input.model);
  return model === undefined ? { state, questions } : { state, questions, model };
}

function parseState(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value) || !isJsonValue(value)) {
    throw new ToolError(
      "invalid_state",
      "run_questions state must be a JSON-serializable object (not an array, string, or non-JSON value). Keep it closed and small — do not dump a repo.",
    );
  }
  return value;
}

function parseOptionalModel(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolError("invalid_arguments", "run_questions model must be a non-empty string when provided.");
  }
  return value.trim();
}

function parseQuestions(value: unknown): PackQuestion[] {
  if (!Array.isArray(value)) {
    throw new ToolError(
      "invalid_questions",
      "run_questions questions must be a non-empty array of typed Choice / Noul / Score items. This is not free-form chat.",
    );
  }
  if (value.length === 0) {
    throw new ToolError(
      "invalid_questions",
      "run_questions requires at least one typed question. This is not free-form chat.",
    );
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  const questions: PackQuestion[] = [];

  for (const [index, raw] of value.entries()) {
    const parsed = parseQuestion(raw, index, seen);
    if (typeof parsed === "string") {
      errors.push(parsed);
      continue;
    }
    questions.push(parsed);
  }

  if (errors.length > 0) {
    throw new ToolError(
      "invalid_questions",
      `run_questions questions failed validation: ${errors.join("; ")}. Use closed Choice / Noul / Score only.`,
      { errors },
    );
  }
  return questions;
}

function parseQuestion(raw: unknown, index: number, seen: Set<string>): PackQuestion | string {
  const prefix = `questions[${index}]`;
  if (!isPlainObject(raw)) {
    return `${prefix} must be an object with id, type, instructions, and type-specific criteria`;
  }

  // Agent dogfood: Score often arrives as `levels` instead of `criteria`; Choice as `options`.
  // Normalize only when `criteria` is absent.
  const normalized = normalizeQuestionAliases(raw, prefix);
  if (typeof normalized === "string") {
    return normalized;
  }
  raw = normalized;

  const extras = Object.keys(raw).filter((key) => !QUESTION_KEYS.has(key));
  if (extras.length > 0) {
    const hint = aliasHint(extras, raw.type);
    return `${prefix} has unknown field(s): ${extras.join(", ")}${hint}`;
  }

  const id = raw.id;
  if (typeof id !== "string" || !QUESTION_ID.test(id)) {
    return `${prefix}.id must be a snake_case identifier (e.g. hottest_candidate)`;
  }
  if (seen.has(id)) {
    return `${prefix}.id "${id}" is duplicated`;
  }
  seen.add(id);

  const type = raw.type;
  if (typeof type !== "string" || !QUESTION_TYPES.has(type)) {
    return `${prefix}.type must be "choice", "noul", or "score"`;
  }

  const instructions = raw.instructions;
  if (typeof instructions !== "string" || instructions.trim().length === 0) {
    return `${prefix}.instructions must be a non-empty string`;
  }

  if (type === "choice") {
    const criteria = parseChoiceCriteria(raw.criteria, prefix);
    if (typeof criteria === "string") {
      return criteria;
    }
    return { id, type: "choice", instructions: instructions.trim(), criteria };
  }

  if (type === "noul") {
    const criteria = parseNoulCriteria(raw.criteria, prefix);
    if (typeof criteria === "string") {
      return criteria;
    }
    return criteria
      ? { id, type: "noul", instructions: instructions.trim(), criteria }
      : { id, type: "noul", instructions: instructions.trim() };
  }

  const criteria = parseScoreCriteria(raw.criteria, prefix);
  if (typeof criteria === "string") {
    return criteria;
  }
  return { id, type: "score", instructions: instructions.trim(), criteria };
}

/** Common agent typos → canonical `criteria`. Fail closed if both are set and differ. */
function normalizeQuestionAliases(
  raw: Record<string, unknown>,
  prefix: string,
): Record<string, unknown> | string {
  const type = raw.type;
  const out: Record<string, unknown> = { ...raw };

  if (type === "score" && "levels" in out) {
    if (out.criteria === undefined) {
      out.criteria = out.levels;
      delete out.levels;
    } else if (JSON.stringify(out.criteria) === JSON.stringify(out.levels)) {
      delete out.levels;
    } else {
      return `${prefix} has both criteria and levels; use criteria (ordered string[]) only`;
    }
  }

  if (type === "choice" && "options" in out) {
    if (out.criteria === undefined) {
      out.criteria = out.options;
      delete out.options;
    } else if (JSON.stringify(out.criteria) === JSON.stringify(out.options)) {
      delete out.options;
    } else {
      return `${prefix} has both criteria and options; use criteria (closed Record) only`;
    }
  }

  return out;
}

function aliasHint(extras: string[], type: unknown): string {
  const bits: string[] = [];
  if (extras.includes("levels")) {
    bits.push("for score use criteria: string[] (not levels)");
  }
  if (extras.includes("options")) {
    bits.push("for choice use criteria: Record (not options)");
  }
  if (extras.includes("legend") && type === "score") {
    bits.push("legend is an answer field, not an input — put ordered labels in criteria");
  }
  return bits.length > 0 ? `. Hint: ${bits.join("; ")}` : "";
}

function parseChoiceCriteria(value: unknown, prefix: string): Record<string, string> | string {
  if (!isPlainObject(value)) {
    return `${prefix}.criteria must be a closed Record<string, string> of options (include a refuse key if needed)`;
  }
  const keys = Object.keys(value);
  if (keys.length < 2) {
    return `${prefix}.criteria needs at least 2 closed options`;
  }
  if (keys.length > MAX_CHOICE_OPTIONS) {
    return `${prefix}.criteria has ${keys.length} options; TypeSafe Choice allows at most ${MAX_CHOICE_OPTIONS}`;
  }
  const criteria: Record<string, string> = {};
  for (const key of keys) {
    if (key.trim().length === 0) {
      return `${prefix}.criteria has an empty option key`;
    }
    const description = value[key];
    if (typeof description !== "string" || description.trim().length === 0) {
      return `${prefix}.criteria.${key} must be a non-empty string`;
    }
    criteria[key] = description;
  }
  return criteria;
}

function parseNoulCriteria(
  value: unknown,
  prefix: string,
): { true?: string; false?: string } | undefined | string {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    return `${prefix}.criteria must be { true?: string, false?: string } when provided`;
  }
  const extras = Object.keys(value).filter((key) => !NOUL_CRITERIA_KEYS.has(key));
  if (extras.length > 0) {
    return `${prefix}.criteria has unknown field(s): ${extras.join(", ")}`;
  }
  const criteria: { true?: string; false?: string } = {};
  for (const key of ["true", "false"] as const) {
    if (!(key in value)) {
      continue;
    }
    const description = value[key];
    if (typeof description !== "string" || description.trim().length === 0) {
      return `${prefix}.criteria.${key} must be a non-empty string`;
    }
    criteria[key] = description;
  }
  return Object.keys(criteria).length > 0 ? criteria : undefined;
}

function parseScoreCriteria(value: unknown, prefix: string): string[] | string {
  if (!Array.isArray(value)) {
    return `${prefix}.criteria must be an ordered string[] of at least 2 score levels`;
  }
  if (value.length < 2) {
    return `${prefix}.criteria needs at least 2 ordered score levels`;
  }
  const criteria: string[] = [];
  for (const [index, level] of value.entries()) {
    if (typeof level !== "string" || level.trim().length === 0) {
      return `${prefix}.criteria[${index}] must be a non-empty string`;
    }
    criteria.push(level);
  }
  return criteria;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value) || isPlainObject(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    const children = Array.isArray(value) ? value : Object.values(value);
    return children.every((child) => isJsonValue(child, seen));
  }
  return false;
}
