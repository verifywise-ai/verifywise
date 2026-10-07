import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({ logEvent: jest.fn() }));
jest.mock("../../utils/llmKey.utils", () => ({
  getLLMKeysQuery: jest.fn(),
  getLLMKeyQuery: jest.fn(),
}));
jest.mock("../../utils/rolePermissions.utils", () => ({
  roleHasPermission: jest.fn(),
}));

import { getLLMKeys, getLLMKey } from "../llmKey.ctrl";
import { getLLMKeysQuery, getLLMKeyQuery } from "../../utils/llmKey.utils";
import { roleHasPermission } from "../../utils/rolePermissions.utils";

const mockList = getLLMKeysQuery as unknown as jest.Mock;
const mockOne = getLLMKeyQuery as unknown as jest.Mock;
const mockCan = roleHasPermission as unknown as jest.Mock;

// A Custom provider's credential usually lives in its headers.
const customKey = {
  id: 1,
  name: "Custom",
  url: "https://user:token@proxy.example.com/v1/sk-live-path-key/chat?api-key=sk-live-1#frag",
  model: "m",
  custom_headers: { Authorization: "Bearer sk-secret" },
};

const req = (role: string): any => ({
  organizationId: 1,
  userId: 2,
  role,
  params: { name: "Custom" },
  t: (k: string) => k,
});
const createRes = (): any => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const returned = (res: any) => res.json.mock.calls[0][0].data;

describe("llmKey.ctrl reads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue([customKey] as never);
    mockOne.mockResolvedValue([customKey] as never);
    mockCan.mockImplementation(async (_org: unknown, role: unknown) => role === "Admin");
  });

  it.each([
    ["list", getLLMKeys],
    ["single key", getLLMKey],
  ])("hides custom headers from a role that cannot manage keys (%s)", async (_label, handler) => {
    const res = createRes();
    await handler(req("Auditor"), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCan).toHaveBeenCalledWith(1, "Auditor", "llmKeys.admin");
    expect(returned(res)[0].custom_headers).toBeNull();
    expect(returned(res)[0].name).toBe("Custom");
  });

  it.each([
    ["list", getLLMKeys],
    ["single key", getLLMKey],
  ])("keeps custom headers for a role that manages keys (%s)", async (_label, handler) => {
    const res = createRes();
    await handler(req("Admin"), res);

    expect(returned(res)[0].custom_headers).toEqual({ Authorization: "Bearer sk-secret" });
  });

  it("hides credentials in a Custom provider's URL from a role that cannot manage keys", async () => {
    const res = createRes();
    await getLLMKeys(req("Auditor"), res);

    // Only the origin: a key can also sit in the path or fragment.
    expect(returned(res)[0].url).toBe("https://proxy.example.com");
  });

  it("keeps the full URL for a role that manages keys", async () => {
    const res = createRes();
    await getLLMKeys(req("Admin"), res);

    expect(returned(res)[0].url).toBe(
      "https://user:token@proxy.example.com/v1/sk-live-path-key/chat?api-key=sk-live-1#frag",
    );
  });

  it("still lists keys when the permission lookup fails, hiding credentials from non-managers", async () => {
    // The Advisor and settings screens only need to know a key exists.
    mockCan.mockRejectedValue(new Error("db down"));
    const res = createRes();
    await getLLMKeys(req("Auditor"), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(returned(res)[0].custom_headers).toBeNull();
    expect(returned(res)[0].url).toBe("https://proxy.example.com");
  });

  it("keeps credentials for an Admin when the permission lookup fails", async () => {
    // Otherwise the edit form would load the masked values and save them
    // back over the real URL and headers.
    mockCan.mockRejectedValue(new Error("db down"));
    const res = createRes();
    await getLLMKeys(req("Admin"), res);

    expect(returned(res)[0].custom_headers).toEqual({ Authorization: "Bearer sk-secret" });
  });

  it("leaves built-in providers' fixed URLs as they are", async () => {
    mockList.mockResolvedValue([
      {
        id: 2,
        name: "OpenRouter",
        url: "https://openrouter.ai/api/v1/",
        model: "m",
        custom_headers: null,
      },
    ] as never);
    const res = createRes();
    await getLLMKeys(req("Auditor"), res);

    expect(returned(res)[0].url).toBe("https://openrouter.ai/api/v1/");
  });
});
