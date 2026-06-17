import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockAcquireTokenByCode = jest.fn<any>();

jest.mock("@azure/msal-node", () => ({
  ConfidentialClientApplication: jest.fn().mockImplementation(() => ({
    acquireTokenByCode: mockAcquireTokenByCode,
  })),
}));

jest.mock("../../../utils/ssoConfig.utils", () => ({
  getAzureADConfigForLoginQuery: jest.fn<any>().mockResolvedValue({
    client_id: "cid",
    tenant_id: "tid",
    client_secret: "csecret",
  }),
}));

jest.mock("../../../utils/user.utils", () => ({
  getUserByEmailQuery: jest.fn<any>(),
  createNewUserQuery: jest.fn<any>(),
  updateUserByIdQuery: jest.fn<any>(),
}));

jest.mock("../../../domain.layer/models/user/user.model", () => ({
  UserModel: {
    createNewUser: jest.fn<any>().mockImplementation(async (...args: any[]) => ({
      ...{ name: args[0], surname: args[1], email: args[2], role_id: args[4], organization_id: args[5] },
      validateUserData: jest.fn<any>().mockResolvedValue(undefined),
    })),
  },
}));

import { loginViaMicrosoftSso, SSO_ROLE_MAP } from "../microsoftSso.service";
import {
  getUserByEmailQuery,
  createNewUserQuery,
  updateUserByIdQuery,
} from "../../../utils/user.utils";

const mockGetUserByEmail = getUserByEmailQuery as jest.MockedFunction<typeof getUserByEmailQuery>;
const mockCreateUser = createNewUserQuery as jest.MockedFunction<typeof createNewUserQuery>;
const mockUpdateUser = updateUserByIdQuery as jest.MockedFunction<typeof updateUserByIdQuery>;

const fakeTransaction = {} as any;

const mockFetch = jest.fn<any>();
(global as any).fetch = mockFetch;

describe("loginViaMicrosoftSso", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquireTokenByCode.mockResolvedValue({
      accessToken: "graph-token",
      idTokenClaims: { roles: ["Reviewer"] },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "azure-id-1",
        mail: "alice@example.com",
        givenName: "Alice",
        surname: "Tan",
      }),
    });
  });

  it("creates a new user when none exists", async () => {
    mockGetUserByEmail.mockResolvedValueOnce(undefined as any);
    mockCreateUser.mockResolvedValueOnce({
      id: 42,
      email: "alice@example.com",
      organization_id: 99,
      role_id: SSO_ROLE_MAP.get("Reviewer")!,
    } as any);

    const result = await loginViaMicrosoftSso(
      { code: "auth-code", organizationId: 99, redirectUri: "http://x/cb" },
      fakeTransaction,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(42);
      expect(result.roleName).toBe("Reviewer");
    }
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when the existing user belongs to another org", async () => {
    mockGetUserByEmail.mockResolvedValueOnce({
      id: 1,
      email: "a@b.co",
      organization_id: 88,
      role_id: 3,
    } as any);

    const result = await loginViaMicrosoftSso(
      { code: "c", organizationId: 99, redirectUri: "http://x/cb" },
      fakeTransaction,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("updates role when SSO role differs from local role", async () => {
    mockGetUserByEmail.mockResolvedValueOnce({
      id: 1,
      email: "a@b.co",
      organization_id: 99,
      role_id: 3,
    } as any);
    mockUpdateUser.mockResolvedValueOnce({} as any);

    await loginViaMicrosoftSso(
      { code: "c", organizationId: 99, redirectUri: "http://x/cb" },
      fakeTransaction,
    );

    expect(mockUpdateUser).toHaveBeenCalledWith(
      1,
      { role_id: SSO_ROLE_MAP.get("Reviewer")! },
      fakeTransaction,
    );
  });

  it("falls back to Editor role when the claim is unknown", async () => {
    mockAcquireTokenByCode.mockResolvedValueOnce({
      accessToken: "t",
      idTokenClaims: { roles: ["GhostRole"] },
    });
    mockGetUserByEmail.mockResolvedValueOnce(undefined as any);
    mockCreateUser.mockResolvedValueOnce({
      id: 1,
      email: "a@b.co",
      organization_id: 99,
    } as any);

    const result = await loginViaMicrosoftSso(
      { code: "c", organizationId: 99, redirectUri: "http://x/cb" },
      fakeTransaction,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.roleName).toBe("Editor");
  });

  it("returns 401 when MSAL returns no token response", async () => {
    mockAcquireTokenByCode.mockResolvedValueOnce(null);
    const result = await loginViaMicrosoftSso(
      { code: "c", organizationId: 99, redirectUri: "http://x/cb" },
      fakeTransaction,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("returns 401 when Graph returns no email", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "x", givenName: "X" }),
    });
    const result = await loginViaMicrosoftSso(
      { code: "c", organizationId: 99, redirectUri: "http://x/cb" },
      fakeTransaction,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});
