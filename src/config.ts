import {
  defaultUserConfigDir,
  readUserEnv,
  resolveApiKey,
  type ApiKeySource,
} from "./user-config.js";

const DEFAULT_MODEL = "jev-latest";
const DEFAULT_TIMEOUT_MS = 20_000;

function trim(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

export type LoadConfigOptions = {
  /** Read ~/.mcp_jev/.env (or this dir). Default: yes when `env` is process.env, or when this is set. */
  userConfigDir?: string;
  readUserStore?: boolean;
};

export type AppConfig = {
  apiKey: string | undefined;
  apiKeySet: boolean;
  apiKeySource: ApiKeySource;
  userConfigDir: string;
  baseURL: string | undefined;
  model: string;
  timeoutMs: number;
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): AppConfig {
  const userConfigDir = options.userConfigDir ?? defaultUserConfigDir();
  const readStore = options.readUserStore ?? (env === process.env || Boolean(options.userConfigDir));
  const stored = readStore ? readUserEnv(userConfigDir) : {};
  const { apiKey, source } = resolveApiKey(env, stored);

  return {
    apiKey,
    apiKeySet: Boolean(apiKey),
    apiKeySource: source,
    userConfigDir,
    baseURL: trim(env.TYPESAFE_BASE_URL) ?? stored.TYPESAFE_BASE_URL,
    model: trim(env.JEV_MODEL) ?? stored.JEV_MODEL ?? trim(env.TYPESAFE_DEFAULT_MODEL) ?? stored.TYPESAFE_DEFAULT_MODEL ?? DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}
