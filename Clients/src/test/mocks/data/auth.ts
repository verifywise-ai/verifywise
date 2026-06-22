export interface MockLoginResponse {
  token: string;
  onboarding_status: string;
  is_org_creator: boolean;
  isSuperAdmin: boolean;
}

export interface MockUserProfile {
  id: number;
  name: string;
  surname: string;
  email: string;
  role_id: number;
  organization_id: number;
  created_at: string;
  last_login: string;
}

export function createMockLoginResponse(
  overrides: Partial<MockLoginResponse> = {},
): MockLoginResponse {
  return {
    token: "mock-jwt-token",
    onboarding_status: "completed",
    is_org_creator: false,
    isSuperAdmin: false,
    ...overrides,
  };
}

export function createMockUserProfile(overrides: Partial<MockUserProfile> = {}): MockUserProfile {
  return {
    id: 1,
    name: "John",
    surname: "Doe",
    email: "john.doe@example.com",
    role_id: 1,
    organization_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    last_login: "2026-06-10T00:00:00Z",
    ...overrides,
  };
}

export const mockLoginResponse: MockLoginResponse = createMockLoginResponse();
export const mockUserProfile: MockUserProfile = createMockUserProfile();
