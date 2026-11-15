/**
 * Keep provider keys out of LLM Evals experiment configs returned to the browser.
 *
 * injectApiKeys (routes/deepEvalRoutes.route.ts) adds the organization's
 * decrypted provider keys to an experiment's config for the run. The EvalServer
 * no longer stores them (EvalServer/src/utils/secret_config.py, same rules), but
 * rows written before that, or copied from legacy schemas, may still hold them,
 * so every path that returns a stored config strips them too.
 */

// Compared case-insensitively, at any depth. scorerApiKey is the older single-key form.
const SECRET_CONFIG_KEYS = new Set([
  "apikey",
  "api_key",
  "apikeys",
  "api_keys",
  "scorerapikey",
  "scorer_api_key",
  "scorerapikeys",
  "scorer_api_keys",
]);

// Copied as-is: keys are never injected here, and datasets may legitimately use these names.
const USER_CONTENT_KEYS = new Set(["dataset"]);

export function stripProviderKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripProviderKeys(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_CONFIG_KEYS.has(k.toLowerCase())) continue;
      out[k] = USER_CONTENT_KEYS.has(k) ? v : stripProviderKeys(v);
    }
    return out as T;
  }
  return value;
}

/** Strip keys from the `config` of each experiment row. */
export function withoutProviderKeys<T extends { config?: unknown }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, config: stripProviderKeys(row.config) }));
}
