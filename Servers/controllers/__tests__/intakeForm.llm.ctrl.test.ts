process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockTx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/dbLogger", () => ({ logEvent: jest.fn() }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../utils/llmKey.utils", () => ({
  llmKeyExistsQuery: jest.fn(),
}));
jest.mock("../../utils/intakeForm.utils", () => ({
  createIntakeFormQuery: jest.fn(),
  updateIntakeFormQuery: jest.fn(),
  getIntakeFormByIdQuery: jest.fn(),
}));
jest.mock("../../services/intakeLLM.service", () => ({
  generateSuggestedQuestions: jest.fn(),
  generateFieldGuidance: jest.fn(),
}));

import {
  getLLMSuggestedQuestions,
  getFieldGuidance,
  createIntakeForm,
  updateIntakeForm,
} from "../intakeForm.ctrl";
import { llmKeyExistsQuery } from "../../utils/llmKey.utils";
import {
  createIntakeFormQuery,
  updateIntakeFormQuery,
  getIntakeFormByIdQuery,
} from "../../utils/intakeForm.utils";
import {
  generateSuggestedQuestions,
  generateFieldGuidance,
} from "../../services/intakeLLM.service";
import { NotFoundException } from "../../domain.layer/exceptions/custom.exception";
import { sequelize } from "../../database/db";
import { ForeignKeyConstraintError } from "sequelize";

const mockExists = llmKeyExistsQuery as unknown as jest.Mock;
const mockCreate = createIntakeFormQuery as unknown as jest.Mock;
const mockUpdate = updateIntakeFormQuery as unknown as jest.Mock;
const mockGetForm = getIntakeFormByIdQuery as unknown as jest.Mock;
const mockQuestions = generateSuggestedQuestions as unknown as jest.Mock;
const mockGuidance = generateFieldGuidance as unknown as jest.Mock;

const req = (body: Record<string, unknown>, params: Record<string, string> = {}): any => ({
  organizationId: 1,
  userId: 2,
  body,
  params,
  t: (k: string) => k,
});
const createRes = (): any => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const notFound = () => new NotFoundException("LLM key not found", "llm_key", 8);

/** What Sequelize throws for a pg 23503 on the given constraint. */
const fkViolation = (constraint: string) =>
  new ForeignKeyConstraintError({
    message: `insert or update on table "intake_forms" violates foreign key constraint "${constraint}"`,
    index: constraint,
    table: "intake_forms",
    parent: Object.assign(new Error("fk"), { code: "23503", constraint }) as any,
  });

describe("intake LLM endpoints", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each([["abc"], [-1], [0], [1.5], [{}]])(
    "suggested questions answers 400 for a non positive integer key id (%p)",
    async (llmKeyId) => {
      const res = createRes();
      await getLLMSuggestedQuestions(req({ llmKeyId }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockQuestions).not.toHaveBeenCalled();
    },
  );

  it("suggested questions passes the key id as a number and answers 404 when the service cannot find the key", async () => {
    mockQuestions.mockRejectedValueOnce(notFound() as never);
    const res = createRes();
    await getLLMSuggestedQuestions(req({ llmKeyId: "8" }), res);

    expect(mockQuestions).toHaveBeenCalledWith("use_case", "", 8, 1);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].data).toEqual({ message: "LLM key not found" });
    expect(mockExists).not.toHaveBeenCalled();
  });

  it("field guidance answers 400 for a non integer key id", async () => {
    const res = createRes();
    await getFieldGuidance(req({ fieldLabel: "Owner", llmKeyId: "x" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGuidance).not.toHaveBeenCalled();
  });

  it("field guidance answers 404 when the service cannot find the key", async () => {
    mockGuidance.mockRejectedValueOnce(notFound() as never);
    const res = createRes();
    await getFieldGuidance(req({ fieldLabel: "Owner", llmKeyId: 8 }), res);

    expect(mockGuidance).toHaveBeenCalledWith("Owner", "use_case", 8, 1);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].data).toEqual({ message: "LLM key not found" });
  });

  it("still answers 500 when a real key fails to generate", async () => {
    mockQuestions.mockResolvedValueOnce(null as never);
    const res = createRes();
    await getLLMSuggestedQuestions(req({ llmKeyId: 2 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("suggested questions answers 400 when the key id is missing", async () => {
    const res = createRes();
    await getLLMSuggestedQuestions(req({}), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe("LLM key ID is required");
    expect(mockQuestions).not.toHaveBeenCalled();
  });

  it("field guidance answers 400 when the field label is missing", async () => {
    const res = createRes();
    await getFieldGuidance(req({ llmKeyId: 8 }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe("Field label and LLM key ID are required");
    expect(mockGuidance).not.toHaveBeenCalled();
  });

  it("field guidance answers 500 when an unexpected error is thrown", async () => {
    mockGuidance.mockRejectedValueOnce(new Error("boom") as never);
    const res = createRes();
    await getFieldGuidance(req({ fieldLabel: "Owner", llmKeyId: 8 }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("returns questions for a real key", async () => {
    mockQuestions.mockResolvedValueOnce([{ label: "Q" }] as never);
    const res = createRes();
    await getLLMSuggestedQuestions(req({ llmKeyId: 2 }), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("intake form writes validate llmKeyId", () => {
  const body = (llmKeyId: unknown) => ({
    name: "Intake",
    entityType: "use_case",
    schema: { version: "1.0", fields: [] },
    llmKeyId,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    (sequelize.transaction as unknown as jest.Mock).mockResolvedValue(mockTx as never);
    mockCreate.mockResolvedValue({ id: 5 } as never);
    mockUpdate.mockResolvedValue({ id: 5 } as never);
    mockGetForm.mockResolvedValue({ id: 5 } as never);
  });

  it.each([["abc"], [-3], [0], [2.5]])(
    "create rejects a non positive integer key id (%p)",
    async (llmKeyId) => {
      const res = createRes();
      await createIntakeForm(req(body(llmKeyId)), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockCreate).not.toHaveBeenCalled();
    },
  );

  it("create rejects a key that is not one of the organization's keys", async () => {
    mockExists.mockResolvedValueOnce(false as never);
    const res = createRes();
    await createIntakeForm(req(body(8)), res);

    expect(mockExists).toHaveBeenCalledWith(8, 1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe("LLM key not found");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("create accepts one of the organization's keys", async () => {
    mockExists.mockResolvedValueOnce(true as never);
    const res = createRes();
    await createIntakeForm(req(body(3)), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect((mockCreate.mock.calls[0][0] as any).llmKeyId).toBe(3);
  });

  it.each([[null], [undefined]])("create allows %p without a lookup", async (llmKeyId) => {
    const res = createRes();
    await createIntakeForm(req(body(llmKeyId)), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockExists).not.toHaveBeenCalled();
  });

  it("update rejects a key that is not one of the organization's keys", async () => {
    mockExists.mockResolvedValueOnce(false as never);
    const res = createRes();
    await updateIntakeForm(req(body(8), { id: "5" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("update rejects a non integer key id", async () => {
    const res = createRes();
    await updateIntakeForm(req(body("8; drop"), { id: "5" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("update allows clearing the key with null", async () => {
    const res = createRes();
    await updateIntakeForm(req(body(null), { id: "5" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect((mockUpdate.mock.calls[0][1] as any).llmKeyId).toBeNull();
    expect(mockExists).not.toHaveBeenCalled();
  });

  it("update accepts one of the organization's keys", async () => {
    mockExists.mockResolvedValueOnce(true as never);
    const res = createRes();
    await updateIntakeForm(req(body("3"), { id: "5" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect((mockUpdate.mock.calls[0][1] as any).llmKeyId).toBe(3);
  });

  it("create answers 400 when the key is deleted between the check and the insert", async () => {
    mockExists.mockResolvedValueOnce(true as never);
    mockCreate.mockRejectedValueOnce(fkViolation("intake_forms_llm_key_id_fkey") as never);
    const res = createRes();
    await createIntakeForm(req(body(3)), res);

    expect(mockTx.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe("LLM key not found");
  });

  it("update answers 400 when the key is deleted between the check and the update", async () => {
    mockExists.mockResolvedValueOnce(true as never);
    mockUpdate.mockRejectedValueOnce(fkViolation("intake_forms_llm_key_id_fkey") as never);
    const res = createRes();
    await updateIntakeForm(req(body(3), { id: "5" }), res);

    expect(mockTx.rollback).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe("LLM key not found");
  });

  it("create still answers 500 for a foreign key violation on another constraint", async () => {
    mockCreate.mockRejectedValueOnce(fkViolation("intake_forms_created_by_fkey") as never);
    const res = createRes();
    await createIntakeForm(req(body(null)), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
