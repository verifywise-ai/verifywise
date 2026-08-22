/**
 * Settings fixtures — SSO config and user preferences.
 *
 * Shadow AI settings and syslog fixtures live in `shadowAi.ts` alongside the
 * rest of that domain, even though they belong to the settings handler group.
 *
 * Envelope note: both areas return the STATUS_CODE `{ message, data }` wrapper.
 * `useUserPreferences` reads `response.data` off the whole body, and
 * `useFrameworks` does the same — so handlers wrap, they do not return bare.
 */

export interface MockSsoConfig {
  id: number;
  provider: string;
  is_enabled: boolean;
  tenant_id: string;
  client_id: string;
  redirect_uri: string;
}

export function createMockSsoConfig(overrides: Partial<MockSsoConfig> = {}): MockSsoConfig {
  return {
    id: 1,
    provider: "AzureAD",
    is_enabled: false,
    tenant_id: "00000000-0000-0000-0000-000000000000",
    client_id: "11111111-1111-1111-1111-111111111111",
    redirect_uri: "http://localhost:5173/auth/callback",
    ...overrides,
  };
}

export const mockSsoConfig = createMockSsoConfig();

export const mockSsoStatus = { enabled: false, configured: true };

export const mockSsoOrgs = [{ id: 1, name: "Acme Corp", tenant_id: "acme" }];

export interface MockUserPreferences {
  id: number;
  user_id: number;
  date_format: string;
  language: string;
  theme: string;
}

export function createMockUserPreferences(
  overrides: Partial<MockUserPreferences> = {},
): MockUserPreferences {
  return {
    id: 1,
    user_id: 1,
    date_format: "DD-MM-YYYY",
    language: "en",
    theme: "light",
    ...overrides,
  };
}

export const mockUserPreferences = createMockUserPreferences();
