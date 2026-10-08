import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../utils/project.utils", () => ({ getProjectByIdQuery: jest.fn() }));
jest.mock("../../utils/euAiActClassification.utils", () => ({
  insertClassificationRunQuery: jest.fn(),
  getLatestRunForUseCaseQuery: jest.fn(),
  setUseCaseClassificationQuery: jest.fn(),
}));
jest.mock("../../utils/useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_, err) => (err as Error).message),
}));
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
  },
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (d: any) => ({ message: "OK", data: d }),
    400: (d: any) => ({ message: "Bad Request", data: d }),
    404: (d: any) => ({ message: "Not Found", data: d }),
    500: (d: any) => ({ message: "Internal Server Error", data: d }),
  },
}));

import {
  classifyUseCase,
  getQuestionnaire,
  getUseCaseClassification,
  scoreAnswers,
} from "../euAiActClassification.ctrl";
import { getProjectByIdQuery } from "../../utils/project.utils";
import {
  getLatestRunForUseCaseQuery,
  insertClassificationRunQuery,
  setUseCaseClassificationQuery,
} from "../../utils/euAiActClassification.utils";
import { recordMultipleFieldChanges } from "../../utils/useCaseChangeHistory.utils";

const req = (overrides: any = {}) => ({
  userId: 7,
  organizationId: 5,
  t: (k: string) => k,
  params: {},
  body: {},
  ...overrides,
});
const res = () => {
  const r: any = {};
  r.status = jest.fn<any>().mockReturnValue(r);
  r.json = jest.fn<any>().mockReturnValue(r);
  return r;
};
const MINIMAL = {
  scope: "in_scope",
  role: "provider",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "section_a",
  transparency: ["none"],
};

const EU_FRAMEWORK = [{ project_framework_id: 1, framework_id: 1, name: "EU AI Act" }];

describe("euAiActClassification.ctrl", () => {
  beforeEach(() => jest.clearAllMocks());

  it("serves the current questionnaire", async () => {
    const r = res();
    await getQuestionnaire(req() as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json.mock.calls[0][0].data.version).toBe(2);
  });

  it("scores answers without saving", async () => {
    const r = res();
    await scoreAnswers(req({ body: { answers: MINIMAL } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json.mock.calls[0][0].data.level).toBe("High risk");
    expect(insertClassificationRunQuery).not.toHaveBeenCalled();
  });

  it("rejects invalid answers with 400", async () => {
    const r = res();
    await scoreAnswers(req({ body: { answers: { scope: "maybe" } } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the use case is not in the organization", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue(null);
    const r = res();
    await getUseCaseClassification(req({ params: { id: "3" } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it("returns the latest run for a use case", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({ id: 3 });
    (getLatestRunForUseCaseQuery as jest.Mock<any>).mockResolvedValue({ id: 11 });
    const r = res();
    await getUseCaseClassification(req({ params: { id: "3" } }) as any, r);
    expect(r.json.mock.calls[0][0].data).toEqual({ id: 11 });
  });

  it("saves a run, sets the level and role, and records history in one transaction", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({
      id: 3,
      ai_risk_classification: "Minimal risk",
      type_of_high_risk_role: "Deployer",
      dataValues: { framework: EU_FRAMEWORK },
    });
    (insertClassificationRunQuery as jest.Mock<any>).mockResolvedValue({ id: 12 });
    (setUseCaseClassificationQuery as jest.Mock<any>).mockResolvedValue(true);
    const r = res();
    await classifyUseCase(req({ params: { id: "3" }, body: { answers: MINIMAL } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(200);
    const run = (insertClassificationRunQuery as jest.Mock<any>).mock.calls[0][0] as any;
    expect(run).toMatchObject({
      useCaseId: 3,
      intakeSubmissionId: null,
      source: "wizard",
      role: "Provider",
    });
    expect(setUseCaseClassificationQuery).toHaveBeenCalledWith(
      3,
      "High risk",
      "Provider",
      7,
      5,
      expect.anything(),
    );
    expect((recordMultipleFieldChanges as jest.Mock<any>).mock.calls[0][3]).toEqual([
      { fieldName: "AI risk classification", oldValue: "Minimal risk", newValue: "High risk" },
      { fieldName: "Type of high-risk role", oldValue: "Deployer", newValue: "Provider" },
    ]);
  });

  it("rolls back and returns 404 when the use case vanished before the update", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({
      id: 3,
      dataValues: { framework: EU_FRAMEWORK },
    });
    (insertClassificationRunQuery as jest.Mock<any>).mockResolvedValue({ id: 12 });
    (setUseCaseClassificationQuery as jest.Mock<any>).mockResolvedValue(false);
    const r = res();
    await classifyUseCase(req({ params: { id: "3" }, body: { answers: MINIMAL } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it("rejects an organizational project with 400 and writes nothing", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({
      id: 3,
      is_organizational: true,
      dataValues: { framework: EU_FRAMEWORK },
    });
    const r = res();
    await classifyUseCase(req({ params: { id: "3" }, body: { answers: MINIMAL } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].data).toMatchObject({
      code: "ORGANIZATIONAL_PROJECT_AI_RISK_NOT_NULL",
    });
    expect(insertClassificationRunQuery).not.toHaveBeenCalled();
    expect(setUseCaseClassificationQuery).not.toHaveBeenCalled();
  });

  it("rejects a use case without the EU AI Act framework with 400 and writes nothing", async () => {
    (getProjectByIdQuery as jest.Mock<any>).mockResolvedValue({
      id: 3,
      is_organizational: false,
      dataValues: { framework: [{ project_framework_id: 2, framework_id: 2, name: "ISO 42001" }] },
    });
    const r = res();
    await classifyUseCase(req({ params: { id: "3" }, body: { answers: MINIMAL } }) as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json.mock.calls[0][0].data).toMatchObject({ code: "AI_RISK_WITHOUT_EU_AI_ACT" });
    expect(insertClassificationRunQuery).not.toHaveBeenCalled();
    expect(setUseCaseClassificationQuery).not.toHaveBeenCalled();
  });
});
