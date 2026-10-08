/**
 * @file rolePermissions.config.test.ts
 * @description Parity tests for the built-in role permission matrix (issue #4588).
 *
 * The built-in matrix must reproduce the legacy hardcoded role-name
 * allowlists exactly, so the five built-in roles (Admin, Editor, Reviewer,
 * Auditor, SuperAdmin) behave identically before and after the migration
 * from `authorize(["Admin", ...])` literals to `authorize(<permission key>)`.
 *
 * Two layers of protection:
 *   1. Structural — every catalog entry has metadata and only names known
 *      built-in roles in its legacy allowlist.
 *   2. Behavioral — the effective permission set of each built-in role is
 *      asserted explicitly against the tiers the legacy literals encoded.
 */

import {
  ALL_PERMISSION_KEYS,
  BUILTIN_ROLE_NAMES,
  BUILTIN_ROLE_PERMISSIONS,
  ROLE_PERMISSIONS,
  type PermissionKey,
} from "../rolePermissions.config";

const BUILTIN_ROLES = ["Admin", "Editor", "Reviewer", "Auditor", "SuperAdmin"] as const;

/** Keys whose legacy allowlist grants access to `role` — mirrors old includes(). */
function keysFor(role: string): Set<PermissionKey> {
  return new Set(
    ALL_PERMISSION_KEYS.filter((key) =>
      (ROLE_PERMISSIONS[key].legacyRoles as readonly string[]).includes(role),
    ),
  );
}

describe("ROLE_PERMISSIONS catalog", () => {
  it("has entries with module, description and a non-empty legacy allowlist", () => {
    for (const key of ALL_PERMISSION_KEYS) {
      const meta = ROLE_PERMISSIONS[key];
      expect(meta.module.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.legacyRoles.length).toBeGreaterThan(0);
    }
  });

  it("only references known built-in roles in legacy allowlists", () => {
    for (const key of ALL_PERMISSION_KEYS) {
      for (const role of ROLE_PERMISSIONS[key].legacyRoles) {
        expect(BUILTIN_ROLE_NAMES.has(role)).toBe(true);
      }
    }
  });
});

describe("BUILTIN_ROLE_PERMISSIONS — legacy parity", () => {
  it("covers exactly the five built-in roles", () => {
    expect(Object.keys(BUILTIN_ROLE_PERMISSIONS).sort()).toEqual([...BUILTIN_ROLES].sort());
  });

  it("grants each built-in role exactly the permissions its legacy allowlists encoded", () => {
    for (const role of BUILTIN_ROLES) {
      expect(BUILTIN_ROLE_PERMISSIONS[role]).toEqual(keysFor(role));
    }
  });

  it("Admin holds every permission", () => {
    expect(BUILTIN_ROLE_PERMISSIONS["Admin"]).toEqual(new Set(ALL_PERMISSION_KEYS));
  });

  it("Editor holds exactly the edit, contributor and reader tiers", () => {
    const expected = ALL_PERMISSION_KEYS.filter((key) => {
      const roles = ROLE_PERMISSIONS[key].legacyRoles;
      return roles.includes("Editor");
    });
    expect(BUILTIN_ROLE_PERMISSIONS["Editor"]).toEqual(new Set(expected));
    // And none of those are admin/super-tier keys.
    for (const key of expected) {
      expect(ROLE_PERMISSIONS[key].legacyRoles).not.toContain("SuperAdmin");
      expect(ROLE_PERMISSIONS[key].legacyRoles).not.toEqual(["Admin"]);
    }
  });

  it("Reviewer holds only contributor and reader-tier permissions", () => {
    const expected = ALL_PERMISSION_KEYS.filter((key) =>
      ROLE_PERMISSIONS[key].legacyRoles.includes("Reviewer"),
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(BUILTIN_ROLE_PERMISSIONS["Reviewer"]).toEqual(new Set(expected));
  });

  it("only Admin and Editor may classify a use case", () => {
    expect(keysFor("Admin").has("useCase.classify")).toBe(true);
    expect(keysFor("Editor").has("useCase.classify")).toBe(true);
    expect(keysFor("Reviewer").has("useCase.classify")).toBe(false);
    expect(keysFor("Auditor").has("useCase.classify")).toBe(false);
  });

  it("Auditor holds only reader-tier permissions", () => {
    const expected = ALL_PERMISSION_KEYS.filter((key) =>
      ROLE_PERMISSIONS[key].legacyRoles.includes("Auditor"),
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(BUILTIN_ROLE_PERMISSIONS["Auditor"]).toEqual(new Set(expected));
  });

  it("SuperAdmin holds only the legacy Admin+SuperAdmin allowlists", () => {
    const expected = ALL_PERMISSION_KEYS.filter((key) =>
      ROLE_PERMISSIONS[key].legacyRoles.includes("SuperAdmin"),
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(BUILTIN_ROLE_PERMISSIONS["SuperAdmin"]).toEqual(new Set(expected));
  });
});
