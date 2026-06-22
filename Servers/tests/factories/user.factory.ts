export type UserData = {
  id: number;
  name: string;
  surname: string;
  email: string;
  password_hash: string;
  role_id: number;
  created_at: Date;
  last_login: Date;
  is_demo?: boolean;
  organization_id?: number;
};

export function buildUser(overrides?: Partial<UserData>): UserData {
  return {
    id: overrides?.id ?? 1,
    name: "Test",
    surname: "User",
    email: "a@b.com",
    password_hash: "hash",
    role_id: 1,
    created_at: new Date("2025-01-01"),
    last_login: new Date("2025-01-01"),
    organization_id: 1,
    ...overrides,
  };
}

export function buildManyUser(count: number, overrides?: Partial<UserData>): UserData[] {
  return Array.from({ length: count }, (_, i) =>
    buildUser({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
