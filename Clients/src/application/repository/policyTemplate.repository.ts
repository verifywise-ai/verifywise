/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Policy Template Repository
 *
 * Application layer wrapper for the organisation-owned policy template
 * endpoints (api/v1/policy-templates). Uses the shared `apiServices` client
 * whose axios baseURL already includes `/api`.
 *
 * @module application/repository/policyTemplate
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  PolicyTemplate,
  PolicyTemplateCreateBody,
  PolicyTemplateFromPolicyBody,
  PolicyTemplateUpdateBody,
} from "../../domain/interfaces/i.policyTemplate";

// Backend responses are wrapped as { data: <payload> }; apiServices already
// returns { data: response.data, ... }, so the payload is at r.data.data.
const extract = <T>(r: any): T => (r?.data?.data ?? r?.data) as T;

export async function getPolicyTemplates(): Promise<PolicyTemplate[]> {
  return extract(await apiServices.get("/v1/policy-templates"));
}

export async function getPolicyTemplate(id: number): Promise<PolicyTemplate> {
  return extract(await apiServices.get(`/v1/policy-templates/${id}`));
}

export async function createPolicyTemplate(
  body: PolicyTemplateCreateBody,
): Promise<PolicyTemplate> {
  return extract(await apiServices.post("/v1/policy-templates", body));
}

export async function updatePolicyTemplate(
  id: number,
  body: PolicyTemplateUpdateBody,
): Promise<PolicyTemplate> {
  return extract(await apiServices.patch(`/v1/policy-templates/${id}`, body));
}

export async function deletePolicyTemplate(id: number): Promise<{ ok: boolean }> {
  return extract(await apiServices.delete(`/v1/policy-templates/${id}`));
}

export async function createPolicyTemplateFromPolicy(
  body: PolicyTemplateFromPolicyBody,
): Promise<PolicyTemplate> {
  // The Save as template modal shows its own error (including the 409 reason),
  // so the global toast would be a duplicate.
  return extract(
    await apiServices.post("/v1/policy-templates/from-policy", body, {
      suppressGlobalErrorToast: true,
    }),
  );
}
