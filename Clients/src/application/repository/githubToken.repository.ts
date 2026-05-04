/**
 * @fileoverview GitHub Token Repository
 *
 * API client functions for managing GitHub Personal Access Tokens.
 * Used for private repository access in AI Detection.
 *
 * @module application/repository/githubToken
 */

import { apiServices } from "../../infrastructure/api/networkServices";

const BASE_URL = "/integrations/github";

// Types
export interface GitHubTokenStatus {
  configured: boolean;
  token_name?: string;
  last_used_at?: string;
  created_at?: string;
}

export interface GitHubTokenTestResult {
  valid: boolean;
  scopes?: string[];
  rate_limit?: {
    limit: number;
    remaining: number;
    reset: string;
  };
  error?: string;
}

/**
 * Get the current GitHub token status (configured or not)
 * Does not return the actual token for security
 */
export async function getGitHubTokenStatus(signal?: AbortSignal): Promise<GitHubTokenStatus> {
  const response = await apiServices.get<{ data: GitHubTokenStatus }>(`${BASE_URL}/token`, {
    signal,
  });
  return response.data.data;
}

/**
 * Save or update the GitHub token
 *
 * @param token - The plain text GitHub PAT
 * @param tokenName - Optional friendly name for the token
 */
export async function saveGitHubToken(
  token: string,
  tokenName?: string,
  signal?: AbortSignal,
): Promise<GitHubTokenStatus> {
  const response = await apiServices.post<{ data: GitHubTokenStatus }>(
    `${BASE_URL}/token`,
    { token, token_name: tokenName },
    {
      signal,
    },
  );
  return response.data.data;
}

/**
 * Delete the GitHub token
 */
export async function deleteGitHubToken(signal?: AbortSignal): Promise<{ message: string }> {
  const response = await apiServices.delete<{ data: { message: string } }>(`${BASE_URL}/token`, {
    signal,
  });
  return response.data.data;
}

/**
 * Test a GitHub token before saving
 *
 * @param token - The plain text GitHub PAT to test
 */
export async function testGitHubToken(
  token: string,
  signal?: AbortSignal,
): Promise<GitHubTokenTestResult> {
  const response = await apiServices.post<{ data: GitHubTokenTestResult }>(
    `${BASE_URL}/token/test`,
    { token },
    {
      signal,
    },
  );
  return response.data.data;
}
