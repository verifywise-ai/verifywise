import { useQuery } from "@tanstack/react-query";
import { getLLMKeyStatus, LLMKeyStatus } from "../repository/llmKeys.repository";
import { useAuth } from "./useAuth";
import { useSettledLoading } from "./useSettledLoading";
import { LLM_KEY_STATUS_QUERY_KEY } from "../constants/llmKeyQueries";

/**
 * Whether the organization has an LLM API key. One cached query per org,
 * shared by its callers. Scoped to the org because the query cache outlives a
 * logout, so a shared key would show one org's status to the next user.
 *
 * `hasKeys` is optimistically true while loading, so callers that gate an
 * action on it do not flash a "no key" state. Without an organization there
 * is nothing to ask about: that is a settled "no keys" answer, not a load.
 */
export function useLLMKeyStatus() {
  const { organizationId } = useAuth();
  const hasOrganization = organizationId != null;
  const query = useQuery<LLMKeyStatus>({
    queryKey: [...LLM_KEY_STATUS_QUERY_KEY, organizationId ?? null],
    queryFn: getLLMKeyStatus,
    enabled: hasOrganization,
  });
  const loading = useSettledLoading(query, hasOrganization, organizationId);

  if (!hasOrganization) {
    return { data: null, loading: false, error: null, hasKeys: false };
  }

  // A failed refetch keeps the last successful answer next to the error, so a
  // transient failure does not flip a known status. With no answer yet, a
  // failure leaves data null and reads as no keys.
  const data = query.data ?? null;
  const error = query.error ? query.error.message || "Failed to fetch LLM key status" : null;

  return { data, loading, error, hasKeys: loading || (data?.hasKeys ?? false) };
}
