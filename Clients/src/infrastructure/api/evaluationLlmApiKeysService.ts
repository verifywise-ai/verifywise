/**
 * LLM Evals provider keys — read from AI Gateway storage (GET /ai-gateway/keys).
 * Add/delete keys only in AI Gateway → Settings → API keys.
 */

import CustomAxios from "./customAxios";

export type LLMProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "mistral"
  | "huggingface"
  | "openrouter";

export interface LLMApiKey {
  id?: number;
  provider: LLMProvider;
  keyName?: string;
  maskedKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddKeyRequest {
  provider: LLMProvider;
  apiKey: string;
}

export interface VerifyKeyRequest {
  provider: string;
  apiKey: string;
}

const EVAL_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "anthropic",
  "google",
  "xai",
  "mistral",
  "huggingface",
  "openrouter",
]);

interface GatewayKeyRow {
  id: number;
  provider: string;
  key_name: string;
  masked_key: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function gatewayProviderToEval(provider: string): LLMProvider | null {
  const p = provider.toLowerCase();
  if (p === "gemini") return "google";
  if (EVAL_PROVIDERS.has(p)) return p as LLMProvider;
  return null;
}

/** Map eval provider to AI Gateway verify/CRUD provider id */
function evalProviderToGatewayVerify(provider: string): string {
  const p = provider.toLowerCase();
  if (p === "google") return "gemini";
  return p;
}

function dedupeLatestPerProvider(keys: LLMApiKey[]): LLMApiKey[] {
  const sorted = [...keys].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const seen = new Set<LLMProvider>();
  const out: LLMApiKey[] = [];
  for (const k of sorted) {
    if (seen.has(k.provider)) continue;
    seen.add(k.provider);
    out.push(k);
  }
  return out;
}

class EvaluationLlmApiKeysService {
  /**
   * Masked keys from AI Gateway for providers that LLM Evals supports.
   */
  async getAllKeys(): Promise<LLMApiKey[]> {
    const response = await CustomAxios.get<{ data: GatewayKeyRow[] }>("/ai-gateway/keys");
    const rows = response.data?.data ?? [];
    const mapped: LLMApiKey[] = [];
    for (const r of rows) {
      if (!r.is_active) continue;
      const evalProv = gatewayProviderToEval(r.provider);
      if (!evalProv) continue;
      mapped.push({
        id: r.id,
        provider: evalProv,
        keyName: r.key_name,
        maskedKey: r.masked_key || "***",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    }
    return dedupeLatestPerProvider(mapped);
  }

  async addKey(request: AddKeyRequest): Promise<LLMApiKey> {
    const gwProvider = evalProviderToGatewayVerify(request.provider);
    const providerLabel = gwProvider.charAt(0).toUpperCase() + gwProvider.slice(1);
    const response = await CustomAxios.post<{ data: GatewayKeyRow }>("/ai-gateway/keys", {
      provider: gwProvider,
      key_name: `${providerLabel} Evals Key`,
      api_key: request.apiKey,
    });
    const r = response.data?.data;
    return {
      id: r?.id,
      provider: request.provider,
      keyName: r?.key_name,
      maskedKey: r?.masked_key || "***",
      createdAt: r?.created_at ?? new Date().toISOString(),
      updatedAt: r?.updated_at ?? new Date().toISOString(),
    };
  }

  async deleteKey(_provider: LLMProvider, id?: number): Promise<void> {
    if (!id) {
      throw new Error("Cannot delete key: key ID not found. Refresh the page and try again.");
    }
    await CustomAxios.delete(`/ai-gateway/keys/${id}`);
  }

  async hasKey(provider: LLMProvider): Promise<boolean> {
    try {
      const keys = await this.getAllKeys();
      return keys.some((k) => k.provider === provider);
    } catch (_error) {
      return false;
    }
  }

  /**
   * Verify via AI Gateway (same provider checks as gateway Settings).
   */
  async verifyKey(request: VerifyKeyRequest): Promise<{ valid: boolean; error?: string }> {
    try {
      const gwProvider = evalProviderToGatewayVerify(request.provider);
      const response = await CustomAxios.post<{ data: { valid: boolean; message?: string } }>(
        "/ai-gateway/keys/verify",
        { provider: gwProvider, api_key: request.apiKey },
      );
      const d = response.data?.data;
      const valid = d?.valid ?? false;
      return {
        valid,
        error: valid ? undefined : d?.message || "Verification failed",
      };
    } catch (error: unknown) {
      console.error("Failed to verify LLM API key:", error);
      return { valid: true };
    }
  }
}

export const evaluationLlmApiKeysService = new EvaluationLlmApiKeysService();
