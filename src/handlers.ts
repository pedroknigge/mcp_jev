import { VERSION as SDK_VERSION } from "@typesafe-ai/sdk";

import type { AppConfig } from "./config.js";
import { parseCustomRunInput } from "./custom-questions.js";
import { missingApiKeyError, ToolError } from "./errors.js";
import { getPack, listPacks, packCount } from "./packs/registry.js";
import { questionsFor, toSdkQuestions } from "./packs/questions.js";
import type { SystemOneCall } from "./typesafe.js";
import { validatePackState } from "./validate.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";

export type ToolJson = Record<string, unknown>;

export function handleListPacks(): ToolJson {
  return { packs: listPacks() };
}

export function handleDescribePack(packId: string): ToolJson {
  const pack = getPack(packId);
  return {
    id: pack.id,
    version: pack.version,
    title: pack.title,
    summary: pack.summary,
    when_to_use: pack.when_to_use,
    state_schema: pack.state_schema,
    questions: pack.questions,
    dynamic_choice_from_state: Boolean(pack.questionsForState),
    example_state: pack.example_state,
    suggested_workflow: pack.suggested_workflow,
    notes: pack.notes,
  };
}

export function handlePing(config: AppConfig): ToolJson {
  return {
    ok: true,
    server: SERVER_NAME,
    server_version: SERVER_VERSION,
    sdk_version: SDK_VERSION,
    packs: packCount(),
    api_key_set: config.apiKeySet,
    api_key_source: config.apiKeySource,
    user_config_dir: config.userConfigDir,
    model: config.model,
    base_url_override: Boolean(config.baseURL),
  };
}

export async function handleRunPack(
  input: { pack_id: string; state: unknown },
  deps: { config: AppConfig; systemOne: SystemOneCall },
): Promise<ToolJson> {
  if (!deps.config.apiKeySet) {
    throw missingApiKeyError();
  }
  if (!input.pack_id || typeof input.pack_id !== "string") {
    throw new ToolError("invalid_arguments", "run_pack requires pack_id (string).");
  }
  if (input.state === undefined) {
    throw new ToolError("invalid_arguments", "run_pack requires state (object matching the pack schema).");
  }

  const pack = getPack(input.pack_id);
  validatePackState(pack, input.state);

  const result = await deps.systemOne({
    state: input.state,
    questions: questionsFor(pack, input.state),
    model: deps.config.model,
  });

  const answers = result.answers as Record<string, unknown>;
  const extra = pack.decorateRunResult?.({ state: input.state, answers }) ?? {};

  return {
    pack_id: pack.id,
    pack_version: pack.version,
    model: result.model,
    answers,
    usage: result.usage,
    ...extra,
  };
}

export async function handleRunQuestions(
  input: { state?: unknown; questions?: unknown; model?: unknown },
  deps: { config: AppConfig; systemOne: SystemOneCall },
): Promise<ToolJson> {
  if (!deps.config.apiKeySet) {
    throw missingApiKeyError();
  }

  const parsed = parseCustomRunInput(input);
  const result = await deps.systemOne({
    state: parsed.state,
    questions: toSdkQuestions(parsed.questions),
    model: parsed.model ?? deps.config.model,
  });

  return {
    model: result.model,
    answers: result.answers,
    usage: result.usage,
  };
}
