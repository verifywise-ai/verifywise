process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({ logEvent: jest.fn() }));
jest.mock("../../utils/llmKey.utils", () => ({
  llmKeyExistsQuery: jest.fn(),
}));
jest.mock("../../services/intakeLLM.service", () => ({
  generateSuggestedQuestions: jest.fn(),
  generateFieldGuidance: jest.fn(),
}));

import { getLLMSuggestedQuestions, getFieldGuidance } from "../intakeForm.ctrl";
import { llmKeyExistsQuery } from "../../utils/llmKey.utils";
import {
  generateSuggestedQuestions,
  generateFieldGuidance,
} from "../../services/intakeLLM.service";

const mockExists = llmKeyExistsQuery as unknown as jest.Mock;
const mockQuestions = generateSuggestedQuestions as unknown as jest.Mock;
const mockGuidance = generateFieldGuidance as unknown as jest.Mock;

const req = (body: Record<string, unknown>): any => ({
  organizationId: 1,
  userId: 2,
  body,
  t: (k: string) => k,
});
const createRes = (): any => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("intake LLM endpoints with a missing key", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("suggested questions answers 400 when the key is not in the organization", async () => {
    mockExists.mockResolvedValue(false as never);
    const res = createRes();
    await getLLMSuggestedQuestions(req({ llmKeyId: 8 }), res);

    expect(mockExists).toHaveBeenCalledWith(8, 1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe("LLM Key not found");
    expect(mockQuestions).not.toHaveBeenCalled();
  });

  it("field guidance answers 400 when the key is not in the organization", async () => {
    mockExists.mockResolvedValue(false as never);
    const res = createRes();
    await getFieldGuidance(req({ fieldLabel: "Owner", llmKeyId: 8 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGuidance).not.toHaveBeenCalled();
  });

  it("still answers 500 when a real key fails to generate", async () => {
    mockExists.mockResolvedValue(true as never);
    mockQuestions.mockResolvedValue(null as never);
    const res = createRes();
    await getLLMSuggestedQuestions(req({ llmKeyId: 2 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("returns questions for a real key", async () => {
    mockExists.mockResolvedValue(true as never);
    mockQuestions.mockResolvedValue([{ label: "Q" }] as never);
    const res = createRes();
    await getLLMSuggestedQuestions(req({ llmKeyId: 2 }), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
