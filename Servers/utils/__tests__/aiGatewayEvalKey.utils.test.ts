/**
 * Tests for getDecryptedAiGatewayKeyForProviderQuery.
 *
 * The function reads a row from ai_gateway_api_keys via Sequelize raw query,
 * decrypts the encrypted_key, and returns the plaintext provider key.
 *
 * Things we want to verify:
 *   - Happy path: latest active row found, decrypt called → key returned
 *   - "google" provider expanded to ('google', 'gemini') alias in WHERE clause
 *   - "gemini" provider lookups work via the same alias path
 *   - Invalid provider names short-circuit to null without DB call
 *   - No matching row → null
 *   - Missing table (PG error 42P01) → null (graceful)
 *   - Other DB errors → propagate
 *   - Decryption error → null + console.error logged
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  __esModule: true,
  sequelize: {
    query: jest.fn(),
  },
}));

jest.mock("../encryption.utils", () => ({
  __esModule: true,
  decrypt: jest.fn(),
}));

import { getDecryptedAiGatewayKeyForProviderQuery } from "../aiGatewayEvalKey.utils";
import { sequelize } from "../../database/db";
import { decrypt } from "../encryption.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockDecrypt = decrypt as jest.MockedFunction<typeof decrypt>;

beforeEach(() => {
  mockQuery.mockReset();
  mockDecrypt.mockReset();
});

describe("getDecryptedAiGatewayKeyForProviderQuery — valid providers", () => {
  it("returns the decrypted key when the row exists (happy path)", async () => {
    mockQuery.mockResolvedValueOnce([[{ encrypted_key: "iv:cipher" }], 1] as any);
    mockDecrypt.mockReturnValueOnce("sk-decrypted-real");

    const result = await getDecryptedAiGatewayKeyForProviderQuery(123, "openai");

    expect(result).toBe("sk-decrypted-real");
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockDecrypt).toHaveBeenCalledWith("iv:cipher");

    const [_sql, opts] = mockQuery.mock.calls[0];
    expect((opts as any).replacements).toEqual({
      organizationId: 123,
      evalProvider: "openai",
    });
  });

  it.each([
    ["openai"],
    ["anthropic"],
    ["xai"],
    ["mistral"],
    ["openrouter"],
    ["huggingface"],
  ] as const)("queries with the provider name lowercased: %s", async (provider) => {
    mockQuery.mockResolvedValueOnce([[{ encrypted_key: `enc-${provider}` }], 1] as any);
    mockDecrypt.mockReturnValueOnce(`plain-${provider}`);

    const result = await getDecryptedAiGatewayKeyForProviderQuery(7, provider);

    expect(result).toBe(`plain-${provider}`);
    const [, opts] = mockQuery.mock.calls[0];
    expect((opts as any).replacements.evalProvider).toBe(provider);
  });
});

describe("getDecryptedAiGatewayKeyForProviderQuery — google/gemini alias", () => {
  it("queries with evalProvider='google' (SQL handles the gemini alias internally)", async () => {
    mockQuery.mockResolvedValueOnce([[{ encrypted_key: "iv:goo" }], 1] as any);
    mockDecrypt.mockReturnValueOnce("AIza-secret");

    const result = await getDecryptedAiGatewayKeyForProviderQuery(42, "google");
    expect(result).toBe("AIza-secret");

    const [sql, opts] = mockQuery.mock.calls[0];
    // The query body should contain the alias OR-clause so a row stored as 'gemini' is also matched.
    expect(String(sql)).toMatch(/google.*gemini/);
    expect((opts as any).replacements.evalProvider).toBe("google");
  });

  // 'gemini' is not in VALID_PROVIDERS, so it short-circuits to null.
  it("returns null for 'gemini' (not a valid LLMProvider on the eval side)", async () => {
    const result = await getDecryptedAiGatewayKeyForProviderQuery(
      42,
      "gemini" as unknown as Parameters<typeof getDecryptedAiGatewayKeyForProviderQuery>[1],
    );
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("getDecryptedAiGatewayKeyForProviderQuery — invalid provider", () => {
  it("returns null without DB lookup for an unknown provider", async () => {
    const result = await getDecryptedAiGatewayKeyForProviderQuery(
      1,
      "totally-fake" as unknown as Parameters<typeof getDecryptedAiGatewayKeyForProviderQuery>[1],
    );
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });
});

describe("getDecryptedAiGatewayKeyForProviderQuery — no row", () => {
  it("returns null when the result set is empty", async () => {
    mockQuery.mockResolvedValueOnce([[], 0] as any);
    const result = await getDecryptedAiGatewayKeyForProviderQuery(1, "openai");
    expect(result).toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it("returns null when row exists but encrypted_key is null/empty", async () => {
    mockQuery.mockResolvedValueOnce([[{ encrypted_key: null }], 1] as any);
    const result = await getDecryptedAiGatewayKeyForProviderQuery(1, "openai");
    expect(result).toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });
});

describe("getDecryptedAiGatewayKeyForProviderQuery — DB errors", () => {
  it("returns null gracefully when ai_gateway_api_keys table does not exist (42P01 on parent)", async () => {
    const err: any = new Error("relation does not exist");
    err.parent = { code: "42P01" };
    mockQuery.mockRejectedValueOnce(err);

    const result = await getDecryptedAiGatewayKeyForProviderQuery(1, "openai");
    expect(result).toBeNull();
  });

  it("returns null gracefully for the same error coming via err.original", async () => {
    const err: any = new Error("relation does not exist");
    err.original = { code: "42P01" };
    mockQuery.mockRejectedValueOnce(err);

    const result = await getDecryptedAiGatewayKeyForProviderQuery(1, "openai");
    expect(result).toBeNull();
  });

  it("re-throws any other database error", async () => {
    const err: any = new Error("connection refused");
    err.parent = { code: "ECONNREFUSED" };
    mockQuery.mockRejectedValueOnce(err);

    await expect(getDecryptedAiGatewayKeyForProviderQuery(1, "openai")).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("getDecryptedAiGatewayKeyForProviderQuery — decrypt failure", () => {
  it("returns null and logs to console.error when decryption fails", async () => {
    mockQuery.mockResolvedValueOnce([[{ encrypted_key: "iv:bad" }], 1] as any);
    mockDecrypt.mockImplementation(() => {
      throw new Error("invalid IV length");
    });

    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await getDecryptedAiGatewayKeyForProviderQuery(1, "openai");

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
