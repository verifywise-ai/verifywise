import { LLMKeysModel } from "../../domain/models/Common/llmKeys/llmKeys.model";
import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Create and update go through /v1/llm-keys, which checks the key with its
 * provider before saving. A refusal is a 400 and "could not check" a 409,
 * both with { message, code }; skip_verification: true saves past the 409.
 */
export type LLMKeyWriteBody = Partial<LLMKeysModel> & { skip_verification?: boolean };

export async function createLLMKey({ body }: { body: LLMKeyWriteBody }): Promise<any> {
  const response = await apiServices.post("/v1/llm-keys", body);
  return response;
}

export async function editLLMKey({
  id,
  body,
}: {
  id: string;
  body: LLMKeyWriteBody;
}): Promise<any> {
  const response = await apiServices.patch(`/v1/llm-keys/${id}`, body);
  return response;
}

export async function getLLMKeys(): Promise<any> {
  const response = await apiServices.get("/llm-keys");
  return response;
}

export async function getLLMKey(name: string): Promise<any> {
  const response = await apiServices.get(`/llm-keys/${name}`);
  return response;
}

export async function deleteLLMKey(id: string): Promise<any> {
  const response = await apiServices.delete(`/llm-keys/${id}`);
  return response;
}

export interface LLMKeyStatus {
  hasKeys: boolean;
  keyCount: number;
  providers: string[];
}

export async function getLLMKeyStatus(): Promise<LLMKeyStatus> {
  const response = await apiServices.get("/llm-keys/status");
  const status = (response.data as any)?.data as LLMKeyStatus | undefined;
  // A body without a status (a proxy page, a cached or truncated response) is
  // a failed load, not "no keys": callers show the add-a-key prompt only on a
  // real answer.
  if (typeof status?.hasKeys !== "boolean") {
    throw new Error("Unexpected LLM key status response");
  }
  return status;
}
