import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
  logFailure: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../services/biasAudit/profileService", () => ({
  getApplicableQuestions: jest.fn(),
  getProfileView: jest.fn(),
  saveAnswers: jest.fn(),
  attestProfile: jest.fn(),
}));
jest.mock("../../services/biasAudit/runService", () => ({
  createRun: jest.fn(),
  listRuns: jest.fn(),
  getTrendRows: jest.fn(),
  getRunView: jest.fn(),
  confirmDerivedBasis: jest.fn(),
}));
jest.mock("../../services/biasAudit/stanceService", () => ({
  generateStance: jest.fn(),
  getStanceDownload: jest.fn(),
}));

const multer = require("multer");
import * as ctrl from "../biasAudit.ctrl";
import * as profileService from "../../services/biasAudit/profileService";
import * as runService from "../../services/biasAudit/runService";
import * as stanceService from "../../services/biasAudit/stanceService";
import {
  BusinessLogicException,
  ConflictException,
  CustomException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const LL144 = "12";

function mockRes() {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  return res;
}

function mockReq(over: Record<string, unknown> = {}): any {
  return { params: {}, query: {}, body: {}, userId: 9, organizationId: 42, role: "Admin", ...over };
}

const svc = <T extends (...a: any[]) => any>(f: T) => f as unknown as jest.Mock<any>;

async function call(handler: any, req: any) {
  const res = mockRes();
  await handler(req, res, jest.fn());
  return { res, status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
}

afterEach(() => jest.clearAllMocks());

describe("getQuestions", () => {
  it("400s without a numeric projectId", async () => {
    const { status } = await call(
      ctrl.getQuestions,
      mockReq({ params: { frameworkId: LL144 }, query: {} }),
    );
    expect(status).toBe(400);
    expect(profileService.getApplicableQuestions).not.toHaveBeenCalled();
  });

  it("404s a framework other than NYC Local Law 144", async () => {
    const { status, body } = await call(
      ctrl.getQuestions,
      mockReq({ params: { frameworkId: "15" }, query: { projectId: "7" } }),
    );
    expect(status).toBe(404);
    expect(JSON.stringify(body)).toMatch(/Local Law 144/);
  });

  it("scopes to the caller's organization and returns the applicable questions", async () => {
    svc(profileService.getApplicableQuestions).mockResolvedValue({
      questions: [{ key: "role.party" }],
    });
    const { status, body } = await call(
      ctrl.getQuestions,
      mockReq({ params: { frameworkId: LL144 }, query: { projectId: "7", organizationId: "999" } }),
    );
    expect(status).toBe(200);
    expect(body.data.questions[0].key).toBe("role.party");
    expect(profileService.getApplicableQuestions).toHaveBeenCalledWith({
      projectId: 7,
      frameworkId: 12,
      organizationId: 42,
    });
  });

  it("maps a project outside the organization to 404", async () => {
    svc(profileService.getApplicableQuestions).mockRejectedValue(
      new NotFoundException("Project 999999 was not found", "Project"),
    );
    const { status } = await call(
      ctrl.getQuestions,
      mockReq({ params: { frameworkId: LL144 }, query: { projectId: "999999" } }),
    );
    expect(status).toBe(404);
  });
});

describe("saveProfileAnswers", () => {
  const params = { projectId: "7", frameworkId: LL144 };
  const good = {
    questionKey: "role.party",
    value: "vendor",
    notes: "We supply it.",
    dontKnow: false,
  };

  it("ignores an organization id in the body and uses the caller's", async () => {
    svc(profileService.saveAnswers).mockResolvedValue({ profileId: 1, version: 1 });
    const { status, body } = await call(
      ctrl.saveProfileAnswers,
      mockReq({ params, body: { organizationId: 999999, answers: [good] } }),
    );
    expect(status).toBe(200);
    expect(profileService.saveAnswers).toHaveBeenCalledWith({
      projectId: 7,
      frameworkId: 12,
      userId: 9,
      organizationId: 42,
      answers: [good],
    });
    expect(JSON.stringify(body)).not.toContain("999999");
  });

  it("400s when answers is not an array", async () => {
    const { status } = await call(ctrl.saveProfileAnswers, mockReq({ params, body: {} }));
    expect(status).toBe(400);
    expect(profileService.saveAnswers).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing question key", { ...good, questionKey: undefined }],
    ["a non-boolean dontKnow", { ...good, dontKnow: "no" }],
    ["a numeric value", { ...good, value: 3 }],
    ["object notes", { ...good, notes: { a: 1 } }],
  ])("400s %s", async (_name, answer) => {
    const { status } = await call(
      ctrl.saveProfileAnswers,
      mockReq({ params, body: { answers: [answer] } }),
    );
    expect(status).toBe(400);
    expect(profileService.saveAnswers).not.toHaveBeenCalled();
  });

  it("passes a veto answer with no notes through as 400 with the service's words", async () => {
    svc(profileService.saveAnswers).mockRejectedValue(
      new ValidationException(
        "Notes are required for role.party: describe the answer in your own words",
        "notes",
      ),
    );
    const { status, body } = await call(
      ctrl.saveProfileAnswers,
      mockReq({ params, body: { answers: [{ ...good, notes: "" }] } }),
    );
    expect(status).toBe(400);
    expect(body.data).toMatch(/own words/);
  });

  it("maps a lost version race to 409", async () => {
    svc(profileService.saveAnswers).mockRejectedValue(
      new ConflictException("Another save created this profile version first."),
    );
    const { status } = await call(
      ctrl.saveProfileAnswers,
      mockReq({ params, body: { answers: [good] } }),
    );
    expect(status).toBe(409);
  });
});

describe("attestProfile", () => {
  it("maps an open deciding question to 409 and names it", async () => {
    svc(profileService.attestProfile).mockRejectedValue(
      new ConflictException(
        "Cannot attest while a deciding question is open (unanswered: scope.weighting, data.held)",
      ),
    );
    const { status, body } = await call(
      ctrl.attestProfile,
      mockReq({ params: { projectId: "7", frameworkId: LL144 } }),
    );
    expect(status).toBe(409);
    expect(body.data).toMatch(/scope\.weighting/);
    expect(profileService.attestProfile).toHaveBeenCalledWith({
      projectId: 7,
      frameworkId: 12,
      userId: 9,
      organizationId: 42,
    });
  });
});

describe("createRun", () => {
  const file = { buffer: Buffer.from("﻿gender,outcome\nMale,1\n"), originalname: "d.csv" };
  const body = {
    projectId: "7",
    frameworkId: LL144,
    mapping: JSON.stringify({ sex: "gender", selected: "outcome" }),
  };

  it("400s without a file", async () => {
    const { status } = await call(ctrl.createRun, mockReq({ body }));
    expect(status).toBe(400);
    expect(runService.createRun).not.toHaveBeenCalled();
  });

  it("400s a mapping that is not a JSON object", async () => {
    for (const mapping of ["not json", "[]", "null", JSON.stringify("x")]) {
      const { status } = await call(ctrl.createRun, mockReq({ file, body: { ...body, mapping } }));
      expect(status).toBe(400);
    }
    expect(runService.createRun).not.toHaveBeenCalled();
  });

  it("400s a mapping whose values are not column names", async () => {
    for (const bad of [{ sex: 3 }, { sex: null }, { sex: ["gender"] }, { sex: "  " }]) {
      const { status, body: out } = await call(
        ctrl.createRun,
        mockReq({ file, body: { ...body, mapping: JSON.stringify(bad) } }),
      );
      expect(status).toBe(400);
      expect(out.data).toMatch(/sex/);
    }
    expect(runService.createRun).not.toHaveBeenCalled();
  });

  it("400s two keys mapped to the same column, naming both", async () => {
    const { status, body: out } = await call(
      ctrl.createRun,
      mockReq({
        file,
        body: { ...body, mapping: JSON.stringify({ sex: "col", race_ethnicity: "col" }) },
      }),
    );
    expect(status).toBe(400);
    expect(out.data).toMatch(/sex/);
    expect(out.data).toMatch(/race_ethnicity/);
    expect(runService.createRun).not.toHaveBeenCalled();
  });

  it("hands the service the raw upload bytes and the caller's organization", async () => {
    svc(runService.createRun).mockResolvedValue({ runId: 11, readiness: {}, outcome: {} });
    const { status } = await call(
      ctrl.createRun,
      mockReq({ file, body: { ...body, organizationId: "999" } }),
    );
    expect(status).toBe(201);
    const input = svc(runService.createRun).mock.calls[0][0];
    expect(input).toMatchObject({
      projectId: 7,
      frameworkId: 12,
      organizationId: 42,
      userId: 9,
      mapping: { sex: "gender", selected: "outcome" },
    });
    expect(input.data).toBe(file.buffer);
  });

  it("maps a missing attested profile to 404 with the service's message", async () => {
    svc(runService.createRun).mockRejectedValue(
      new NotFoundException("There is no attested profile for this project", "AedtProfile"),
    );
    const { status, body: out } = await call(ctrl.createRun, mockReq({ file, body }));
    expect(status).toBe(404);
    expect(out.data).toMatch(/attested profile/);
  });

  it("maps a refused run to 400", async () => {
    svc(runService.createRun).mockRejectedValue(new ValidationException("Out of scope", "x"));
    const { status } = await call(ctrl.createRun, mockReq({ file, body }));
    expect(status).toBe(400);
  });
});

describe("runs", () => {
  it("lists runs for a project and framework in the organization", async () => {
    svc(runService.listRuns).mockResolvedValue({ runs: [] });
    const { status } = await call(
      ctrl.listRuns,
      mockReq({ query: { projectId: "7", frameworkId: LL144 } }),
    );
    expect(status).toBe(200);
    expect(runService.listRuns).toHaveBeenCalledWith({
      projectId: 7,
      frameworkId: 12,
      organizationId: 42,
    });
  });

  it("400s a run list or trend without a projectId", async () => {
    for (const h of [ctrl.listRuns, ctrl.getRunTrend]) {
      const { status } = await call(h, mockReq({ query: { frameworkId: LL144 } }));
      expect(status).toBe(400);
    }
  });

  it("400s a non-numeric run id and 404s an unknown one", async () => {
    expect((await call(ctrl.getRun, mockReq({ params: { id: "abc" } }))).status).toBe(400);
    expect((await call(ctrl.getRun, mockReq({ params: { id: "-1" } }))).status).toBe(400);
    svc(runService.getRunView).mockRejectedValue(new NotFoundException("Run 5 was not found"));
    expect((await call(ctrl.getRun, mockReq({ params: { id: "5" } }))).status).toBe(404);
    expect(runService.getRunView).toHaveBeenCalledWith(5, 42);
  });

  it("confirms a derived basis as the caller", async () => {
    svc(runService.confirmDerivedBasis).mockResolvedValue({ runId: 5, derivedBasis: {} });
    const { status } = await call(ctrl.confirmDerivedBasis, mockReq({ params: { id: "5" } }));
    expect(status).toBe(200);
    expect(runService.confirmDerivedBasis).toHaveBeenCalledWith(5, 9, 42);
  });
});

describe("generateStance", () => {
  it("creates a stance as the caller in the caller's organization", async () => {
    svc(stanceService.generateStance).mockResolvedValue({ stanceId: 3, version: 1, sha256: "a" });
    const { status } = await call(ctrl.generateStance, mockReq({ params: { id: "11" } }));
    expect(status).toBe(201);
    expect(stanceService.generateStance).toHaveBeenCalledWith({
      runId: 11,
      organizationId: 42,
      userId: 9,
    });
  });

  it("maps an export refusal to 422 with its message, never 500", async () => {
    svc(stanceService.generateStance).mockRejectedValue(
      new BusinessLogicException(
        "The data checks for this run do not allow the stance to be exported.",
      ),
    );
    const { status, body } = await call(ctrl.generateStance, mockReq({ params: { id: "11" } }));
    expect(status).toBe(422);
    expect(body.data).toMatch(/do not allow the stance to be exported/);
  });

  it("maps a project mismatch to 400 and a lost version race to 409", async () => {
    svc(stanceService.generateStance).mockRejectedValue(
      new ValidationException("The project does not match the run's project", "projectId"),
    );
    expect((await call(ctrl.generateStance, mockReq({ params: { id: "11" } }))).status).toBe(400);
    svc(stanceService.generateStance).mockRejectedValue(new ConflictException("raced"));
    expect((await call(ctrl.generateStance, mockReq({ params: { id: "11" } }))).status).toBe(409);
  });

  it("answers an unexpected failure with 500", async () => {
    svc(stanceService.generateStance).mockRejectedValue(new Error("browser died"));
    expect((await call(ctrl.generateStance, mockReq({ params: { id: "11" } }))).status).toBe(500);
  });
});

describe("downloadStance", () => {
  it("answers 410 when the file is gone", async () => {
    svc(stanceService.getStanceDownload).mockRejectedValue(
      new CustomException("The PDF for stance 3 is no longer stored.", {
        code: "GONE",
        statusCode: 410,
      }),
    );
    const { status, body } = await call(ctrl.downloadStance, mockReq({ params: { id: "3" } }));
    expect(status).toBe(410);
    expect(body.data).toMatch(/no longer stored/);
  });

  it("404s a stance outside the organization", async () => {
    svc(stanceService.getStanceDownload).mockRejectedValue(new NotFoundException("nope"));
    const { status } = await call(ctrl.downloadStance, mockReq({ params: { id: "3" } }));
    expect(status).toBe(404);
    expect(stanceService.getStanceDownload).toHaveBeenCalledWith(3, 42, {
      userId: 9,
      role: "Admin",
    });
  });

  it("sends the PDF bytes with their hash", async () => {
    const pdf = Buffer.from("%PDF-1.4");
    svc(stanceService.getStanceDownload).mockResolvedValue({
      filename: "s.pdf",
      content: pdf,
      sha256: "f".repeat(64),
    });
    const { res } = await call(ctrl.downloadStance, mockReq({ params: { id: "3" } }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-SHA256", "f".repeat(64));
    expect(res.send).toHaveBeenCalledWith(pdf);
  });
});

describe("handleDatasetUploadError", () => {
  it("answers an oversized file with 413 and the limit", async () => {
    const res = mockRes();
    const next = jest.fn();
    ctrl.handleDatasetUploadError(new multer.MulterError("LIMIT_FILE_SIZE"), mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(JSON.stringify(res.json.mock.calls[0][0])).toMatch(/30 MB/);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers a file that is not a CSV with 415", async () => {
    const res = mockRes();
    ctrl.handleDatasetUploadError(new Error("UNSUPPORTED_FILE_TYPE"), mockReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(415);
  });

  it("answers any other upload error with 400", async () => {
    const res = mockRes();
    ctrl.handleDatasetUploadError(
      new multer.MulterError("LIMIT_FILE_COUNT"),
      mockReq(),
      res,
      jest.fn(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("passes an unrelated error on", async () => {
    const res = mockRes();
    const next = jest.fn();
    const err = new Error("other");
    ctrl.handleDatasetUploadError(err, mockReq(), res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
