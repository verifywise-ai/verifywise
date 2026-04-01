import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { ILLMKey, LLMProvider } from "../domain.layer/interfaces/i.llmKey";
import { LLMKeyModel } from "../domain.layer/models/llmKey/llmKey.model";

/**
 * Masks an API key, showing only the last 4 characters
 * @param key - The API key to mask
 * @returns Masked key like "****...abcd"
 */
export const maskApiKey = (key: string): string => {
  if (!key || key.length < 4) return "****";
  return `****...${key.slice(-4)}`;
};

export const getLLMKeysQuery = async (organizationId: number) => {
  const result = (await sequelize.query(
    `SELECT id, name, url, model, custom_headers, created_at FROM llm_keys WHERE organization_id = :organizationId ORDER BY created_at DESC;`,
    { replacements: { organizationId } },
  )) as [LLMKeyModel[], number];
  return result[0];
};

/**
 * Gets LLM keys including the actual API key (for internal use only, e.g., advisor)
 * WARNING: This returns sensitive data - do not expose to API responses
 */
export const getLLMKeysWithKeyQuery = async (organizationId: number) => {
  const result = (await sequelize.query(
    `SELECT id, name, url, model, key, custom_headers, created_at FROM llm_keys WHERE organization_id = :organizationId ORDER BY created_at DESC;`,
    { replacements: { organizationId } },
  )) as [LLMKeyModel[], number];
  return result[0];
};

export const getLLMKeyQuery = async (organizationId: number, name: string) => {
  const result = (await sequelize.query(
    `SELECT id, name, url, model, custom_headers, created_at FROM llm_keys WHERE organization_id = :organizationId AND name = :name;`,
    {
      replacements: { organizationId, name },
    },
  )) as [LLMKeyModel[], number];
  return result[0];
};

export const createLLMKeyQuery = async (
  data: ILLMKey,
  organizationId: number,
  transaction: Transaction,
) => {
  // Exclude 'key' from RETURNING to prevent exposing API key in response
  const result = (await sequelize.query(
    `INSERT INTO llm_keys (organization_id, key, name, url, model, custom_headers) VALUES (:organization_id, :key, :name, :url, :model, :custom_headers) RETURNING id, name, url, model, custom_headers, created_at;`,
    {
      replacements: {
        organization_id: organizationId,
        key: data.key,
        name: data.name,
        url: data.url,
        model: data.model,
        custom_headers: data.custom_headers ? JSON.stringify(data.custom_headers) : null,
      },
      transaction,
    },
  )) as [ILLMKey[], number];
  return result[0][0];
};

export const updateLLMKeyByIdQuery = async (
  id: number,
  data: Partial<LLMKeyModel>,
  organizationId: number,
  transaction: Transaction,
): Promise<LLMKeyModel | null> => {
  const updateData: Record<string, any> = { organization_id: organizationId };
  const fields = ["name", "key", "url", "model", "custom_headers"];
  const setClause = fields
    .filter((f) => {
      const value = data[f as keyof typeof data];
      // Allow null for custom_headers (to clear it) and url (to clear it)
      if (value !== undefined) {
        if (f === "custom_headers") {
          updateData[f] = value ? JSON.stringify(value) : null;
        } else {
          updateData[f] = value;
        }
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  if (!setClause) return null;

  // Exclude 'key' from RETURNING to prevent exposing API key in response
  const query = `UPDATE llm_keys SET ${setClause} WHERE organization_id = :organization_id AND id = :id RETURNING id, name, url, model, custom_headers, created_at;`;

  updateData.id = id;

  const result = await sequelize.query(query, {
    replacements: updateData,
    mapToModel: true,
    model: LLMKeyModel,
    transaction,
  });

  return result[0];
};

export const deleteLLMKeyQuery = async (id: number, organizationId: number) => {
  const result = await sequelize.query(
    `DELETE FROM llm_keys WHERE organization_id = :organizationId AND id = :id RETURNING *;`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: LLMKeyModel,
      type: QueryTypes.DELETE,
    },
  );
  return result.length > 0;
};

const standardProviderUrls: Record<string, string> = {
  Anthropic: "https://api.anthropic.com/v1",
  OpenAI: "https://api.openai.com/v1/",
  OpenRouter: "https://openrouter.ai/api/v1/",
};

export const getLLMProviderUrl = (provider: LLMProvider): string => {
  return standardProviderUrls[provider] || "";
};

export const isValidLLMProvider = (
  provider: string,
): provider is LLMProvider => {
  return ["Anthropic", "OpenAI", "OpenRouter", "Custom"].includes(provider);
};
