import { describe, it, expect } from "vitest";
import { extractUserToken } from "../extractToken";

describe("extractUserToken", () => {
  const createToken = (payload: object): string => {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = btoa(JSON.stringify(payload));
    const signature = "fake-signature";
    return `${header}.${body}.${signature}`;
  };

  it("decodes a valid JWT payload", () => {
    const payload = {
      id: "1",
      email: "test@example.com",
      name: "John",
      surname: "Doe",
      roleId: "1",
      expire: "1700000000",
      iat: "1699999000",
      roleName: "Admin",
      organizationId: "1",
      tenantId: "abc123",
    };
    const token = createToken(payload);
    const result = extractUserToken(token);
    expect(result).toEqual(payload);
  });

  it("returns null for empty string", () => {
    expect(extractUserToken("")).toBeNull();
  });

  it("returns null for token with wrong number of parts", () => {
    expect(extractUserToken("only.two")).toBeNull();
  });

  it("returns null for malformed base64 payload", () => {
    expect(extractUserToken("header.!!!invalid!!!.signature")).toBeNull();
  });

  it("returns null for invalid JSON in payload", () => {
    const invalidJson = btoa("not json");
    expect(extractUserToken(`header.${invalidJson}.signature`)).toBeNull();
  });
});
