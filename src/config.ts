const DEFAULT_MODEL = "jev-latest";
const DEFAULT_TIMEOUT_MS = 20_000;

function trim(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

export type AppConfig = {
  apiKey: string | undefined;
  apiKeySet: boolean;
  baseURL: string | undefined;
  model: string;
  timeoutMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiKey = trim(env.TYPESAFE_API_KEY);
  return {
    apiKey,
    apiKeySet: Boolean(apiKey),
    baseURL: trim(env.TYPESAFE_BASE_URL),
    model: trim(env.JEV_MODEL) ?? trim(env.TYPESAFE_DEFAULT_MODEL) ?? DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}
