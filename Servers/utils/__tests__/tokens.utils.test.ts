/**
 * Tests for the API-token query layer.
 *
 * These exercise the REAL query builders (not mocks of them) against a mocked
 * `sequelize.query`, asserting that each query carries the predicates the auth
 * and limit logic depends on. The middleware unit tests mock
 * getActiveApiTokenByHashQuery wholesale, so without these the actual SQL —
 * the revocation filter, the expiry filter, the org scoping, the active-only
 * token count — would be untested and could silently regress.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  __esModule: true,
  sequelize: {
    query: jest.fn(),
  },
}));

import {
  hashApiToken,
  getActiveApiTokenByHashQuery,
  getNumberOfApiTokensQuery,
  revokeApiTokenQuery,
  touchApiTokenLastUsedQuery,
  getApiTokensQuery,
} from "../tokens.utils";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;

// Collapse whitespace so assertions are robust to formatting/indentation.
const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim().toLowerCase();

beforeEach(() => {
  mockQuery.mockReset();
});

describe("hashApiToken", () => {
  it("produces a stable 64-char sha256 hex digest and is not the raw token", () => {
    const token = "eyJhbGciOi.JIUzI1Ni.signature";
    const hash = hashApiToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    // Deterministic: same input → same hash (so write-side and read-side match).
    expect(hashApiToken(token)).toBe(hash);
  });
});

describe("getActiveApiTokenByHashQuery", () => {
  it("filters by org, hash, NOT revoked, and unexpired", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 7, revoked: false }], 1] as any);

    await getActiveApiTokenByHashQuery(42, "deadbeef");

    const [sql, opts] = mockQuery.mock.calls[0];
    const normalized = normalize(sql as string);
    // The four predicates that make a token valid. If any is dropped, a revoked
    // or expired token could authenticate.
    expect(normalized).toContain("organization_id = :organizationid");
    expect(normalized).toContain("token = :tokenhash");
    expect(normalized).toContain("revoked = false");
    expect(normalized).toContain("expires_at > now()");
    expect((opts as any).replacements).toEqual({
      organizationId: 42,
      tokenHash: "deadbeef",
    });
  });

  it("returns null when no active row matches (revoked/expired/deleted)", async () => {
    mockQuery.mockResolvedValueOnce([[], 0] as any);
    const result = await getActiveApiTokenByHashQuery(42, "deadbeef");
    expect(result).toBeNull();
  });

  it("returns the row when an active token matches", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 9, revoked: false }], 1] as any);
    const result = await getActiveApiTokenByHashQuery(1, "abc");
    expect(result).toEqual({ id: 9, revoked: false });
  });
});

describe("getNumberOfApiTokensQuery", () => {
  it("counts only non-revoked tokens so revoked rows do not consume the limit", async () => {
    mockQuery.mockResolvedValueOnce([[{ count: "3" }], 1] as any);

    const count = await getNumberOfApiTokensQuery(42);

    const [sql, opts] = mockQuery.mock.calls[0];
    const normalized = normalize(sql as string);
    expect(normalized).toContain("count(*)");
    expect(normalized).toContain("organization_id = :organizationid");
    // The critical filter: without this, revoking a token (or the migration
    // retiring all legacy rows) would permanently consume slots toward the cap.
    expect(normalized).toContain("revoked = false");
    expect((opts as any).replacements).toEqual({ organizationId: 42 });
    expect(count).toBe(3);
  });
});

describe("revokeApiTokenQuery", () => {
  it("soft-revokes a still-active row scoped to the org and reports success", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 5 }], 1] as any);

    const ok = await revokeApiTokenQuery(5, 42);

    const [sql, opts] = mockQuery.mock.calls[0];
    const normalized = normalize(sql as string);
    expect(normalized).toContain("set revoked = true");
    expect(normalized).toContain("organization_id = :organizationid");
    // Idempotency guard: only an already-active row can be revoked.
    expect(normalized).toContain("revoked = false");
    expect((opts as any).replacements).toEqual({ id: 5, organizationId: 42 });
    expect(ok).toBe(true);
  });

  it("reports failure when no active row matches (already revoked or absent)", async () => {
    mockQuery.mockResolvedValueOnce([[], 0] as any);
    const ok = await revokeApiTokenQuery(5, 42);
    expect(ok).toBe(false);
  });
});

describe("touchApiTokenLastUsedQuery", () => {
  it("updates last_used_at scoped by id and org", async () => {
    mockQuery.mockResolvedValueOnce([[], 0] as any);

    await touchApiTokenLastUsedQuery(7, 42);

    const [sql, opts] = mockQuery.mock.calls[0];
    const normalized = normalize(sql as string);
    expect(normalized).toContain("set last_used_at = now()");
    expect(normalized).toContain("id = :id");
    expect(normalized).toContain("organization_id = :organizationid");
    expect((opts as any).replacements).toEqual({ id: 7, organizationId: 42 });
  });
});

describe("getApiTokensQuery", () => {
  it("never selects the token (hash) column, so no secret leaves the database", async () => {
    mockQuery.mockResolvedValueOnce([[], 0] as any);

    await getApiTokensQuery(42);

    const [sql] = mockQuery.mock.calls[0];
    const normalized = normalize(sql as string);
    // Status fields are exposed to the UI...
    expect(normalized).toContain("revoked");
    expect(normalized).toContain("last_used_at");
    // ...but the stored hash must never be selected back to the client.
    expect(normalized).not.toMatch(/select[^;]*\btoken\b/);
  });
});
