import type { IUser } from "../../domain/interfaces/i.user";

export function buildUser(overrides: Partial<IUser> = {}): IUser {
  return {
    id: overrides.id ?? 1,
    name: "John",
    surname: "Doe",
    email: "john.doe@example.com",
    role_id: 1,
    roleId: 1,
    organization_id: 1,
    is_demo: false,
    pwd_set: true,
    created_at: new Date("2026-01-01T00:00:00Z"),
    last_login: new Date("2026-06-10T00:00:00Z"),
    ...overrides,
  };
}

export function buildManyUser(count: number, overrides?: Partial<IUser>): IUser[] {
  return Array.from({ length: count }, (_, i) =>
    buildUser({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
