/**
 * The v1 LLM key writes check the key with its provider before saving; the
 * legacy writes keep their contract and never call the provider.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const transaction = { commit: jest.fn(), rollback: jest.fn() };

jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => transaction) },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({ logEvent: jest.fn() }));
jest.mock("../../utils/llmKey.utils", () => ({
  createLLMKeyQuery: jest.fn(),
  updateLLMKeyByIdQuery: jest.fn(),
  getLLMKeyWithKeyByIdQuery: jest.fn(),
  isValidLLMProvider: jest.fn((name: string) =>
    ["Anthropic", "OpenAI", "OpenRouter", "Custom"].includes(name),
  ),
  getLLMProviderUrl: jest.fn((name: string) => `https://${name.toLowerCase()}.example.com`),
}));
jest.mock("../../utils/aiDetectionRiskScoring.utils", () => ({
  resetVulnerabilityConsentOnProviderChangeQuery: jest.fn(),
}));
jest.mock("../../services/llmKeyVerification", () => ({ verifyLLMKey: jest.fn() }));

import { createLLMKey, createLLMKeyV1, updateLLMKey, updateLLMKeyV1 } from "../llmKey.ctrl";
import {
  createLLMKeyQuery,
  getLLMKeyWithKeyByIdQuery,
  updateLLMKeyByIdQuery,
} from "../../utils/llmKey.utils";
import { verifyLLMKey } from "../../services/llmKeyVerification";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

const mockVerify = verifyLLMKey as unknown as jest.Mock<any>;
const mockCreate = createLLMKeyQuery as unknown as jest.Mock<any>;
const mockUpdate = updateLLMKeyByIdQuery as unknown as jest.Mock<any>;
const mockStored = getLLMKeyWithKeyByIdQuery as unknown as jest.Mock<any>;
const mockTransaction = sequelize.transaction as unknown as jest.Mock<any>;

// Fills {placeholders} so the test sees the values that reach the message.
const t = (key: string, vars?: Record<string, string>) =>
  key.replace(/\{(\w+)\}/g, (_m, name) => vars?.[name] ?? `{${name}}`);

const res = (): any => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};
const req = (body: Record<string, unknown>, params: Record<string, string> = {}): any => ({
  organizationId: 7,
  userId: 2,
  params,
  body,
  t,
});
const sent = (r: any) => r.json.mock.calls[0][0];

const anthropicBody = { name: "Anthropic", key: "sk-ant-usr-1", model: "claude-sonnet-4-5" };

describe("createLLMKeyV1", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 1, name: "Anthropic" });
  });

  it("checks the key with its custom headers and saves it when the provider accepts it", async () => {
    mockVerify.mockResolvedValue({ ok: true });
    const r = res();
    await createLLMKeyV1(
      req({ ...anthropicBody, custom_headers: { "anthropic-workspace-id": "wrkspc_1" } }),
      r,
    );

    expect(mockVerify).toHaveBeenCalledWith({
      name: "Anthropic",
      key: "sk-ant-usr-1",
      model: "claude-sonnet-4-5",
      url: "https://anthropic.example.com",
      custom_headers: { "anthropic-workspace-id": "wrkspc_1" },
    });
    expect(r.status).toHaveBeenCalledWith(201);
    expect(mockCreate).toHaveBeenCalled();
  });

  it.each([
    [
      "workspace_required",
      "This Anthropic key is not tied to a workspace. Create the key inside a workspace in the Anthropic Console, or enter the workspace ID.",
    ],
    ["invalid_key", "The provider rejected this key. Check that you copied all of it."],
    ["model_unavailable", "This key cannot use claude-sonnet-4-5. Choose another model."],
  ])("refuses %s with a 400, a code and a message, and saves nothing", async (code, message) => {
    mockVerify.mockResolvedValue({ ok: false, code });
    const r = res();
    await createLLMKeyV1(req(anthropicBody), r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(sent(r)).toEqual({ message: "Bad Request", data: { message, code } });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses a key it could not check with a 409", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "unreachable" });
    const r = res();
    await createLLMKeyV1(req(anthropicBody), r);

    expect(r.status).toHaveBeenCalledWith(409);
    expect(sent(r)).toEqual({
      message: "Conflict",
      data: { message: "Could not reach Anthropic to check this key.", code: "unreachable" },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("saves a key it could not check when skip_verification is true", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "unreachable" });
    const r = res();
    await createLLMKeyV1(req({ ...anthropicBody, skip_verification: true }), r);

    expect(r.status).toHaveBeenCalledWith(201);
    expect(mockCreate).toHaveBeenCalled();
    // The flag is not a column.
    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("skip_verification");
  });

  it("does not let skip_verification save a key the provider rejected", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "invalid_key" });
    const r = res();
    await createLLMKeyV1(req({ ...anthropicBody, skip_verification: true }), r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("only takes skip_verification as the boolean true", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "unreachable" });
    const r = res();
    await createLLMKeyV1(req({ ...anthropicBody, skip_verification: "true" }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it("names the endpoint, not the provider, for a Custom key it could not reach", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "unreachable" });
    const r = res();
    await createLLMKeyV1(
      req({ name: "Custom", key: "k", model: "m", url: "https://proxy.example.com/v1" }),
      r,
    );
    expect(sent(r).data.message).toBe("Could not reach the endpoint to check this key.");
  });

  it("validates the body before calling the provider", async () => {
    const r = res();
    await createLLMKeyV1(req({ name: "Anthropic" }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("answers 500 when the check itself throws", async () => {
    mockVerify.mockRejectedValue(new Error("unexpected"));
    const r = res();
    await createLLMKeyV1(req(anthropicBody), r);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateLLMKeyV1", () => {
  const stored = {
    id: 3,
    name: "Anthropic",
    key: "sk-ant-stored",
    model: "claude-sonnet-4-5",
    url: "https://anthropic.example.com",
    custom_headers: { "anthropic-workspace-id": "wrkspc_old" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStored.mockResolvedValue(stored);
    mockUpdate.mockResolvedValue({ id: 3, name: "Anthropic" });
  });

  it("checks a model-only change against the stored key, URL and headers", async () => {
    mockVerify.mockResolvedValue({ ok: true });
    const r = res();
    await updateLLMKeyV1(req({ model: "claude-opus-4-1" }, { id: "3" }), r);

    expect(mockStored).toHaveBeenCalledWith(3, 7);
    expect(mockVerify).toHaveBeenCalledWith({
      name: "Anthropic",
      key: "sk-ant-stored",
      model: "claude-opus-4-1",
      url: "https://anthropic.example.com",
      custom_headers: { "anthropic-workspace-id": "wrkspc_old" },
    });
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("checks the new key and headers over the stored ones", async () => {
    mockVerify.mockResolvedValue({ ok: true });
    await updateLLMKeyV1(req({ ...anthropicBody, custom_headers: null }, { id: "3" }), res());
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({ key: "sk-ant-usr-1", custom_headers: null }),
    );
  });

  it("refuses a rejected key with a 400 and leaves the stored key as it was", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "workspace_required" });
    const r = res();
    await updateLLMKeyV1(req(anthropicBody, { id: "3" }), r);

    expect(r.status).toHaveBeenCalledWith(400);
    expect(sent(r).data.code).toBe("workspace_required");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("saves an unchecked change only with skip_verification", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "unreachable" });
    const refused = res();
    await updateLLMKeyV1(req(anthropicBody, { id: "3" }), refused);
    expect(refused.status).toHaveBeenCalledWith(409);
    expect(mockUpdate).not.toHaveBeenCalled();

    const saved = res();
    await updateLLMKeyV1(req({ ...anthropicBody, skip_verification: true }, { id: "3" }), saved);
    expect(saved.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("answers 404 for another organization's key without calling the provider", async () => {
    mockStored.mockResolvedValue(null);
    const r = res();
    await updateLLMKeyV1(req(anthropicBody, { id: "99" }), r);

    expect(mockStored).toHaveBeenCalledWith(99, 7);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

describe("createLLMKeyV1 details", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 1 });
  });

  it.each([
    ["Anthropic", undefined, "claude-sonnet-4-20250514"],
    ["OpenAI", "", "gpt-4o-mini"],
    ["OpenRouter", null, "gpt-4o-mini"],
  ])(
    "checks %s with the default model the Advisor uses when none is set (%p)",
    async (name, model, expected) => {
      mockVerify.mockResolvedValue({ ok: true });
      await createLLMKeyV1(req({ name, key: "k", model }), res());
      expect(mockVerify).toHaveBeenCalledWith(expect.objectContaining({ model: expected }));
    },
  );

  it.each([
    ["cannot_list_models", "This key cannot list models, so it could not be fully checked."],
    ["model_not_listed", "claude-sonnet-4-5 is not in this endpoint's model list."],
  ])("answers a soft %s with a 409 and its own message", async (reason, message) => {
    mockVerify.mockResolvedValue({ ok: false, code: "unreachable", reason });
    const r = res();
    await createLLMKeyV1(req(anthropicBody), r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(sent(r).data).toEqual({ message, code: "unreachable", reason });
  });

  it("saves past a soft model_not_listed with skip_verification", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "unreachable", reason: "model_not_listed" });
    const r = res();
    await createLLMKeyV1(req({ ...anthropicBody, skip_verification: true }), r);
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it("names a key with impossible characters", async () => {
    mockVerify.mockResolvedValue({ ok: false, code: "invalid_key", reason: "bad_characters" });
    const r = res();
    await createLLMKeyV1(req(anthropicBody), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(sent(r).data).toEqual({
      message: "The key contains characters a key cannot have. Paste it again.",
      code: "invalid_key",
      reason: "bad_characters",
    });
  });

  it("logs only the error's name when the check throws, never its text", async () => {
    mockVerify.mockRejectedValue(new TypeError("invalid header value sk-ant-usr-1"));
    const r = res();
    await createLLMKeyV1(req(anthropicBody), r);
    expect(r.status).toHaveBeenCalledWith(500);
    const logged = JSON.stringify((logger.error as jest.Mock).mock.calls);
    expect(logged).toContain("TypeError");
    expect(logged).not.toContain("sk-ant-usr-1");
    expect(JSON.stringify(sent(r))).not.toContain("sk-ant-usr-1");
  });
});

describe("updateLLMKeyV1 destination changes", () => {
  const storedCustom = {
    id: 4,
    name: "Custom",
    key: "sk-stored-secret",
    model: "llama-3",
    url: "https://old.example.com/v1",
    custom_headers: { Authorization: "Bearer stored-secret" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ id: 4 });
    mockVerify.mockResolvedValue({ ok: true });
  });

  it("asks for the key again when the provider changes, before calling anyone", async () => {
    mockStored.mockResolvedValue(storedCustom);
    const r = res();
    await updateLLMKeyV1(req({ name: "OpenAI", model: "gpt-4o" }, { id: "4" }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(sent(r).data).toBe(
      "Enter the API key again when you change the provider or the endpoint.",
    );
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("asks for the key again when a Custom URL changes", async () => {
    mockStored.mockResolvedValue(storedCustom);
    const r = res();
    await updateLLMKeyV1(req({ url: "https://new.example.com/v1" }, { id: "4" }), r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("checks and saves a URL-only change on a Custom key, dropping the stored headers", async () => {
    mockStored.mockResolvedValue(storedCustom);
    const r = res();
    await updateLLMKeyV1(req({ url: "https://new.example.com/v1", key: "sk-new" }, { id: "4" }), r);
    expect(mockVerify).toHaveBeenCalledWith({
      name: "Custom",
      key: "sk-new",
      model: "llama-3",
      url: "https://new.example.com/v1",
      custom_headers: null,
    });
    expect(r.status).toHaveBeenCalledWith(200);
    expect(mockUpdate.mock.calls[0][1]).toEqual({
      key: "sk-new",
      url: "https://new.example.com/v1",
      custom_headers: null,
    });
  });

  it("keeps headers sent with a URL change", async () => {
    mockStored.mockResolvedValue(storedCustom);
    await updateLLMKeyV1(
      req(
        { url: "https://new.example.com/v1", key: "sk-new", custom_headers: { "X-T": "1" } },
        { id: "4" },
      ),
      res(),
    );
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({ custom_headers: { "X-T": "1" } }),
    );
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({ custom_headers: { "X-T": "1" } });
  });

  it("does not ask for the key when the URL stays the same", async () => {
    mockStored.mockResolvedValue(storedCustom);
    const r = res();
    await updateLLMKeyV1(
      req({ name: "Custom", url: "https://old.example.com/v1", model: "mistral" }, { id: "4" }),
      r,
    );
    expect(r.status).toHaveBeenCalledWith(200);
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "sk-stored-secret",
        custom_headers: { Authorization: "Bearer stored-secret" },
      }),
    );
  });

  it("ignores a URL sent for a built-in provider", async () => {
    mockStored.mockResolvedValue({
      ...storedCustom,
      name: "OpenAI",
      url: "https://openai.example.com",
    });
    const r = res();
    await updateLLMKeyV1(req({ url: "https://evil.example.com" }, { id: "4" }), r);
    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://openai.example.com" }),
    );
    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty("url");
  });
});

describe("legacy writes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 1 });
    mockUpdate.mockResolvedValue({ id: 3 });
  });

  it("createLLMKey saves without calling the provider", async () => {
    const r = res();
    await createLLMKey(req(anthropicBody), r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("updateLLMKey saves a URL-only change on a Custom key to that URL", async () => {
    mockStored.mockResolvedValue({ id: 4, name: "Custom", url: "https://old.example.com/v1" });
    const r = res();
    await updateLLMKey(req({ url: "https://new.example.com/v1" }, { id: "4" }), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(mockUpdate.mock.calls[0][1]).toEqual({ url: "https://new.example.com/v1" });
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("updateLLMKey saves without calling the provider", async () => {
    const r = res();
    await updateLLMKey(req(anthropicBody, { id: "3" }), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockStored).not.toHaveBeenCalled();
  });
});
