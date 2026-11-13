/**
 * @fileoverview Where GitHub should send AI Detection CI/CD webhooks.
 *
 * @module hooks/useWebhookConfig
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getWebhookConfig } from "../repository/aiDetectionRepository.repository";
import type { WebhookConfig } from "../../domain/ai-detection/repositoryTypes";

export const WEBHOOK_CONFIG_QUERY_KEY = ["ai-detection", "webhook-config"] as const;

/** The deployment's address only changes on a restart, so keep it for the session. */
const WEBHOOK_CONFIG_STALE_TIME = 60 * 60 * 1000;

/** The API base this app was built with, when it is an absolute http(s) URL. */
export function absoluteApiBaseUrl(value: string | undefined): string | undefined {
  const trimmed = (value || "").trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

/**
 * Fetches the webhook URL only when `enabled` (the CI/CD section is open) and
 * caches it, so opening the repository modal does not refetch it every time.
 */
export const useWebhookConfig = (enabled: boolean): UseQueryResult<WebhookConfig, Error> =>
  useQuery({
    queryKey: WEBHOOK_CONFIG_QUERY_KEY,
    queryFn: ({ signal }) =>
      getWebhookConfig(absoluteApiBaseUrl(import.meta.env.VITE_APP_API_BASE_URL), signal),
    enabled,
    staleTime: WEBHOOK_CONFIG_STALE_TIME,
    gcTime: WEBHOOK_CONFIG_STALE_TIME,
    retry: false,
  });
