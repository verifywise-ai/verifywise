/**
 * Resolve decrypted LLM provider keys from AI Gateway storage (ai_gateway_api_keys)
 * for LLM Evals proxy injection. Uses the same encryption as gateway + eval keys.
 *
 * google (eval UI) and gemini (gateway UI) are treated as aliases.
 */

import { sequelize } from "../database/db";
import { decrypt } from "./encryption.utils";
import {
  LLMProvider,
  VALID_PROVIDERS,
} from "../domain.layer/models/evaluationLlmApiKey/evaluationLlmApiKey.model";

/**
 * Latest active gateway key for the eval provider (by updated_at).
 */
export async function getDecryptedAiGatewayKeyForProviderQuery(
  organizationId: number,
  provider: LLMProvider,
): Promise<string | null> {
  if (!VALID_PROVIDERS.includes(provider)) {
    return null;
  }

  const evalProvider = provider.toLowerCase();

  let result: [{ encrypted_key: string }[], unknown];
  try {
    result = (await sequelize.query(
      `SELECT encrypted_key
       FROM ai_gateway_api_keys
       WHERE organization_id = :organizationId
         AND is_active = true
         AND (
           (LOWER(:evalProvider) = 'google' AND LOWER(provider) IN ('google', 'gemini'))
           OR (LOWER(:evalProvider) <> 'google' AND LOWER(provider) = LOWER(:evalProvider))
         )
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      { replacements: { organizationId, evalProvider } },
    )) as [{ encrypted_key: string }[], unknown];
  } catch (err: any) {
    // Table does not exist yet (AIGateway not initialised) — return null gracefully
    if (err?.parent?.code === "42P01" || err?.original?.code === "42P01") {
      return null;
    }
    throw err;
  }

  const row = result[0][0];
  if (!row?.encrypted_key) {
    return null;
  }

  try {
    return decrypt(row.encrypted_key);
  } catch (err) {
    console.error("[aiGatewayEvalKey] Failed to decrypt gateway key for provider:", provider, err);
    return null;
  }
}
