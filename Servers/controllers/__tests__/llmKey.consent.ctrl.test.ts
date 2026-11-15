/**
 * Editing an LLM key to another provider or endpoint must reset AI
 * Detection's consent to send code through that key, in the same transaction
 * and before the key row changes.
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
  updateLLMKeyByIdQuery: jest.fn(),
  isValidLLMProvider: jest.fn(() => true),
  getLLMProviderUrl: jest.fn((name: string) => `https://${name.toLowerCase()}.example.com`),
}));
jest.mock("../../utils/aiDetectionRiskScoring.utils", () => ({
  resetVulnerabilityConsentOnProviderChangeQuery: jest.fn(),
}));

import { updateLLMKey } from "../llmKey.ctrl";
import { updateLLMKeyByIdQuery } from "../../utils/llmKey.utils";
import { resetVulnerabilityConsentOnProviderChangeQuery } from "../../utils/aiDetectionRiskScoring.utils";

const mockUpdate = updateLLMKeyByIdQuery as unknown as jest.Mock<any>;
const mockReset = resetVulnerabilityConsentOnProviderChangeQuery as unknown as jest.Mock<any>;

const res = (): any => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};

const req = (body: Record<string, unknown>): any => ({
  organizationId: 7,
  userId: 2,
  params: { id: "3" },
  body,
  t: (k: string) => k,
});

describe("updateLLMKey vulnerability consent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockResolvedValue({ id: 3, name: "OpenAI" });
    mockReset.mockResolvedValue(undefined);
  });

  it("checks the provider and URL change before updating the key, in the same transaction", async () => {
    const order: string[] = [];
    mockReset.mockImplementation(async () => {
      order.push("reset");
    });
    mockUpdate.mockImplementation(async () => {
      order.push("update");
      return { id: 3 };
    });

    const r = res();
    await updateLLMKey(req({ name: "Anthropic" }), r);

    expect(order).toEqual(["reset", "update"]);
    expect(mockReset).toHaveBeenCalledWith(
      3,
      7,
      { name: "Anthropic", url: "https://anthropic.example.com" },
      transaction,
    );
    expect(transaction.commit).toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("passes a Custom endpoint URL so an endpoint change resets consent", async () => {
    await updateLLMKey(req({ name: "Custom", url: "https://other.example.com/v1" }), res());
    expect(mockReset).toHaveBeenCalledWith(
      3,
      7,
      { name: "Custom", url: "https://other.example.com/v1" },
      transaction,
    );
  });

  it("passes no provider or URL for a model-only edit, which keeps consent", async () => {
    await updateLLMKey(req({ model: "gpt-5" }), res());
    expect(mockReset).toHaveBeenCalledWith(3, 7, { name: undefined, url: undefined }, transaction);
  });

  it("rolls back without updating the key when the consent reset fails", async () => {
    mockReset.mockRejectedValue(new Error("db down"));
    const r = res();
    await updateLLMKey(req({ name: "Anthropic" }), r);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(500);
  });
});
