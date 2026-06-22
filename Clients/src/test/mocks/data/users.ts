export interface MockUser {
  id: number;
  name: string;
  surname: string;
  email: string;
  role_id: number;
  organization_id: number;
  created_at: string;
  last_login: string;
  is_demo: boolean;
  pwd_set: boolean;
}

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: 1,
    name: "John",
    surname: "Doe",
    email: "john.doe@example.com",
    role_id: 1,
    organization_id: 1,
    created_at: "2026-01-01T00:00:00Z",
    last_login: "2026-06-10T00:00:00Z",
    is_demo: false,
    pwd_set: true,
    ...overrides,
  };
}

export const mockUsers: MockUser[] = [
  createMockUser(),
  createMockUser({
    id: 2,
    name: "Jane",
    surname: "Smith",
    email: "jane.smith@example.com",
    role_id: 2,
  }),
  createMockUser({
    id: 3,
    name: "Bob",
    surname: "Johnson",
    email: "bob.johnson@example.com",
    role_id: 3,
  }),
];
