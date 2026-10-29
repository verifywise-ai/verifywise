import { afterEach, describe, expect, it, jest } from "@jest/globals";

// logHelper runs for real (spied), so the tests see what reaches each sink
// below it: a duplicate log line would show up as an extra call on a sink.
jest.mock("../../utils/logger/logHelper", () => {
  const actual = jest.requireActual("../../utils/logger/logHelper") as Record<string, any>;
  return {
    logProcessing: jest.fn(actual.logProcessing),
    logSuccess: jest.fn(actual.logSuccess),
    logFailure: jest.fn(actual.logFailure),
  };
});
// One transport, as the default logger has in development; a test empties it
// to stand for production, where it has none.
const serverLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  transports: [{}] as unknown[],
};
const logStructured = jest.fn();
const logCentralOnly = jest.fn();
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: serverLogger,
  logStructured,
  logCentralOnly,
}));
jest.mock("../../utils/logger/redact", () => ({
  redactSensitiveInfo: (s: string) => s.replace(/password=\S+/g, "password=[REDACTED]"),
}));
const logEvent = jest.fn<any>().mockResolvedValue(undefined);
jest.mock("../../utils/logger/dbLogger", () => ({ logEvent }));
jest.mock("../../services/biasAudit/profileService", () => ({
  getQuestionSet: jest.fn(),
  getProfileView: jest.fn(),
  saveAnswers: jest.fn(),
  attestProfile: jest.fn(),
}));
jest.mock("../../services/biasAudit/runService", () => ({
  createRun: jest.fn(),
  listRuns: jest.fn(),
  getTrendSeries: jest.fn(),
  getRunView: jest.fn(),
  confirmDerivedBasis: jest.fn(),
}));
jest.mock("../../services/biasAudit/stanceService", () => ({
  generateStance: jest.fn(),
  generateProfileStance: jest.fn(),
  getStanceDownload: jest.fn(),
}));

jest.mock("../../services/biasAudit/corpusService", () => ({
  startCorpusGeneration: jest.fn(),
  listCorpora: jest.fn(),
  getCorpusView: jest.fn(),
  streamCorpusDownload: jest.fn(),
  resumeCorpus: jest.fn(),
  getJobDescriptionsView: jest.fn(),
}));

const multer = require("multer");
import * as ctrl from "../biasAudit.ctrl";
import * as profileService from "../../services/biasAudit/profileService";
import * as runService from "../../services/biasAudit/runService";
import * as stanceService from "../../services/biasAudit/stanceService";
import * as corpusService from "../../services/biasAudit/corpusService";
import {
  GatewayConfigError,
  GatewayNotConfiguredError,
} from "../../services/biasAudit/generation/settings";
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
    expect(profileService.getQuestionSet).not.toHaveBeenCalled();
  });

  it("404s a framework other than NYC Local Law 144", async () => {
    const { status, body } = await call(
      ctrl.getQuestions,
      mockReq({ params: { frameworkId: "15" }, query: { projectId: "7" } }),
    );
    expect(status).toBe(404);
    expect(JSON.stringify(body)).toMatch(/Local Law 144/);
  });

  it("scopes to the caller's organization and returns the question set", async () => {
    svc(profileService.getQuestionSet).mockResolvedValue({
      questions: [{ key: "role.party" }],
    });
    const { status, body } = await call(
      ctrl.getQuestions,
      mockReq({ params: { frameworkId: LL144 }, query: { projectId: "7", organizationId: "999" } }),
    );
    expect(status).toBe(200);
    expect(body.data.questions[0].key).toBe("role.party");
    expect(profileService.getQuestionSet).toHaveBeenCalledWith({
      projectId: 7,
      frameworkId: 12,
      organizationId: 42,
      userId: 9,
      role: "Admin",
    });
  });

  it("maps a project outside the organization to 404", async () => {
    svc(profileService.getQuestionSet).mockRejectedValue(
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
      role: "Admin",
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
      role: "Admin",
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

  // The parser trims header names when it matches them, so "Gender " and
  // "Gender" are one column there and must be one column here.
  it("400s two keys mapped to the same column once surrounding spaces are ignored", async () => {
    const { status, body: out } = await call(
      ctrl.createRun,
      mockReq({
        file,
        body: { ...body, mapping: JSON.stringify({ sex: "Gender", race_ethnicity: "Gender " }) },
      }),
    );
    expect(status).toBe(400);
    expect(out.data).toMatch(/sex/);
    expect(out.data).toMatch(/race_ethnicity/);
    expect(runService.createRun).not.toHaveBeenCalled();
  });

  it("hands the service the corpus id, and null when absent or blank", async () => {
    svc(runService.createRun).mockResolvedValue({ runId: 11, readiness: {}, outcome: {} });
    await call(ctrl.createRun, mockReq({ file, body: { ...body, corpusId: "3" } }));
    expect(svc(runService.createRun).mock.calls[0][0].corpusId).toBe(3);
    for (const corpusId of [undefined, ""]) {
      svc(runService.createRun).mockClear();
      await call(ctrl.createRun, mockReq({ file, body: { ...body, corpusId } }));
      expect(svc(runService.createRun).mock.calls[0][0].corpusId).toBeNull();
    }
  });

  it.each(["0", "-1", "abc", "3.5"])("400s a corpus id of %s", async (corpusId) => {
    const { status } = await call(ctrl.createRun, mockReq({ file, body: { ...body, corpusId } }));
    expect(status).toBe(400);
    expect(runService.createRun).not.toHaveBeenCalled();
  });

  it("hands the service the job description as typed, and null when absent or blank", async () => {
    svc(runService.createRun).mockResolvedValue({ runId: 11, readiness: {}, outcome: {} });
    await call(
      ctrl.createRun,
      mockReq({ file, body: { ...body, jobDescription: "  Senior  Engineer " } }),
    );
    await call(ctrl.createRun, mockReq({ file, body }));
    await call(ctrl.createRun, mockReq({ file, body: { ...body, jobDescription: "   " } }));
    const keys = svc(runService.createRun).mock.calls.map((c: any[]) => c[0].jobDescriptionKey);
    expect(keys).toEqual(["Senior Engineer", null, null]);
  });

  it("400s a job description that is not text, too long, or has no letter or digit", async () => {
    for (const jobDescription of [["a"], "x".repeat(65), "—!?"]) {
      const { status, body: out } = await call(
        ctrl.createRun,
        mockReq({ file, body: { ...body, jobDescription } }),
      );
      expect(status).toBe(400);
      expect(out.data).toMatch(/job ?description/i);
    }
    expect(runService.createRun).not.toHaveBeenCalled();
  });

  it("hands the service trimmed column names", async () => {
    svc(runService.createRun).mockResolvedValue({ runId: 11, readiness: {}, outcome: {} });
    await call(
      ctrl.createRun,
      mockReq({
        file,
        body: { ...body, mapping: JSON.stringify({ sex: " gender ", selected: "outcome\t" }) },
      }),
    );
    expect(svc(runService.createRun).mock.calls[0][0].mapping).toEqual({
      sex: "gender",
      selected: "outcome",
    });
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

  it("maps a refused upload to 400", async () => {
    svc(runService.createRun).mockRejectedValue(new ValidationException("Bad mapping", "x"));
    const { status } = await call(ctrl.createRun, mockReq({ file, body }));
    expect(status).toBe(400);
  });

  it("maps a refusal from the attested profile's state to 409, keeping its message", async () => {
    svc(runService.createRun).mockRejectedValue(
      new ConflictException("Out of scope", "AedtProfile", "scope.weighting"),
    );
    const { status, body: out } = await call(ctrl.createRun, mockReq({ file, body }));
    expect(status).toBe(409);
    expect(JSON.stringify(out)).toMatch(/Out of scope/);
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
      userId: 9,
      role: "Admin",
    });
  });

  it("400s a run list or trend without a projectId", async () => {
    for (const h of [ctrl.listRuns, ctrl.getRunTrend]) {
      const { status } = await call(h, mockReq({ query: { frameworkId: LL144 } }));
      expect(status).toBe(400);
    }
  });

  it("answers the trend with the series the service built", async () => {
    const series = {
      segments: [
        {
          profileVersion: 1,
          questionSetVersion: 1,
          jobDescriptionKey: null,
          metric: "selection_rate",
          points: [
            { runId: 1, date: "2026-01-10", category: "sex", lowestRatio: 0.9, flagged: false },
          ],
        },
      ],
      breaks: [],
    };
    svc(runService.getTrendSeries).mockResolvedValue(series);
    const { status, body } = await call(
      ctrl.getRunTrend,
      mockReq({ query: { projectId: "7", frameworkId: LL144 } }),
    );
    expect(status).toBe(200);
    expect(body.data).toEqual(series);
    expect(body.data).not.toHaveProperty("runs");
  });

  it("400s a non-numeric run id and 404s an unknown one", async () => {
    expect((await call(ctrl.getRun, mockReq({ params: { id: "abc" } }))).status).toBe(400);
    expect((await call(ctrl.getRun, mockReq({ params: { id: "-1" } }))).status).toBe(400);
    svc(runService.getRunView).mockRejectedValue(new NotFoundException("Run 5 was not found"));
    expect((await call(ctrl.getRun, mockReq({ params: { id: "5" } }))).status).toBe(404);
    expect(runService.getRunView).toHaveBeenCalledWith(5, 42, { userId: 9, role: "Admin" });
  });

  it("confirms a derived basis as the caller", async () => {
    svc(runService.confirmDerivedBasis).mockResolvedValue({ runId: 5, derivedBasis: {} });
    const { status } = await call(ctrl.confirmDerivedBasis, mockReq({ params: { id: "5" } }));
    expect(status).toBe(200);
    expect(runService.confirmDerivedBasis).toHaveBeenCalledWith(5, 42, {
      userId: 9,
      role: "Admin",
    });
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
      role: "Admin",
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

  it("answers an unexpected failure with a generic 500, keeping the raw text out", async () => {
    svc(stanceService.generateStance).mockRejectedValue(new Error("browser died"));
    const { status, body } = await call(ctrl.generateStance, mockReq({ params: { id: "11" } }));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("browser died");
  });
});

describe("generateProfileStance", () => {
  const req = (params: Record<string, unknown> = { projectId: "7", frameworkId: LL144 }) =>
    mockReq({ params });

  it("creates a scope determination as the caller, answering like the run-stance route", async () => {
    svc(stanceService.generateProfileStance).mockResolvedValue({
      stanceId: 30,
      version: 1,
      sha256: "c",
    });
    const { status, body } = await call(ctrl.generateProfileStance, req());
    expect(status).toBe(201);
    expect(body.data).toEqual({ stanceId: 30, version: 1, sha256: "c" });
    expect(stanceService.generateProfileStance).toHaveBeenCalledWith({
      projectId: 7,
      frameworkId: 12,
      organizationId: 42,
      userId: 9,
      role: "Admin",
    });
  });

  it.each([["abc"], ["0"], ["-1"], ["1.5"], ["9007199254740993"]])(
    "400s a projectId of %s without calling the service",
    async (projectId) => {
      const { status } = await call(
        ctrl.generateProfileStance,
        req({ projectId, frameworkId: LL144 }),
      );
      expect(status).toBe(400);
      expect(stanceService.generateProfileStance).not.toHaveBeenCalled();
    },
  );

  it("400s a frameworkId that is not a positive whole number and 404s another framework", async () => {
    expect(
      (await call(ctrl.generateProfileStance, req({ projectId: "7", frameworkId: "x" }))).status,
    ).toBe(400);
    expect(
      (await call(ctrl.generateProfileStance, req({ projectId: "7", frameworkId: "1" }))).status,
    ).toBe(404);
    expect(stanceService.generateProfileStance).not.toHaveBeenCalled();
  });

  it("ignores an organization id in the body", async () => {
    svc(stanceService.generateProfileStance).mockResolvedValue({ stanceId: 30 });
    await call(
      ctrl.generateProfileStance,
      mockReq({ params: { projectId: "7", frameworkId: LL144 }, body: { organizationId: 1 } }),
    );
    expect(svc(stanceService.generateProfileStance).mock.calls[0][0]).toMatchObject({
      organizationId: 42,
    });
  });

  it.each([
    [new NotFoundException("No attested profile exists for this project"), 404],
    [new BusinessLogicException("A stance for an in-scope profile comes from a run"), 422],
    [new ConflictException("raced"), 409],
    [new ValidationException("The project does not match the profile's project", "projectId"), 400],
  ])("maps %s to %i with its message", async (error, expected) => {
    svc(stanceService.generateProfileStance).mockRejectedValue(error);
    const { status, body } = await call(ctrl.generateProfileStance, req());
    expect(status).toBe(expected);
    expect(body.data).toBe((error as Error).message);
  });

  it("answers an unexpected failure with a generic 500, never the raw error text", async () => {
    svc(stanceService.generateProfileStance).mockRejectedValue(
      new Error("browser died at /srv/secret/path"),
    );
    const { status, body } = await call(ctrl.generateProfileStance, req());
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("/srv/secret/path");
  });
});

describe.each([
  ["generateStance", () => ctrl.generateStance, mockReq({ params: { id: "11" } })],
  [
    "generateProfileStance",
    () => ctrl.generateProfileStance,
    mockReq({ params: { projectId: "7", frameworkId: LL144 } }),
  ],
] as const)("%s failure logging", (name, handler, req) => {
  const service = () =>
    svc(
      name === "generateStance"
        ? stanceService.generateStance
        : stanceService.generateProfileStance,
    );

  /** Every text one sink received, joined, to look for leaks. */
  const seen = (sink: jest.Mock) => JSON.stringify(sink.mock.calls);
  const errorLines = () => logStructured.mock.calls.filter((c) => c[0] === "error");
  const errorEvents = () => logEvent.mock.calls.filter((c) => c[0] === "Error");

  it("records the raw cause once, on the central stack, and one generic entry in each org-visible log", async () => {
    const raw = new Error("chromium crashed at /srv/secret/path password=hunter2");
    service().mockRejectedValue(raw);
    const { status, body } = await call(handler(), req);
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toContain("/srv/secret/path");

    // Central stack: exactly one error record, with message and stack, redacted.
    expect(logCentralOnly).toHaveBeenCalledTimes(1);
    const [state, text, functionName, fileName] = logCentralOnly.mock.calls[0] as string[];
    expect([state, functionName, fileName]).toEqual(["error", name, "biasAudit.ctrl.ts"]);
    expect(text).toContain("chromium crashed at /srv/secret/path");
    expect(text).toContain(raw.stack!.split("\n")[1].trim());
    expect(text).not.toContain("hunter2");

    // Local server record (the development console here): the same text,
    // once; nothing else logs an error there.
    expect(serverLogger.error).toHaveBeenCalledTimes(1);
    expect(serverLogger.error.mock.calls[0][0]).toBe(text);

    // Tenant file log (org-readable): one error line, generic.
    expect(errorLines()).toEqual([["error", `${name} failed`, name, "biasAudit.ctrl.ts"]]);
    // Event log (org-readable): one entry, generic.
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(errorEvents()).toEqual([
      ["Error", `${name} failed: stance generation failed unexpectedly`, 9, 42],
    ]);
    expect(seen(logStructured) + seen(logEvent)).not.toMatch(/secret|chromium|hunter2/);
  });

  it.each([
    ["DatabaseException-like 500", 500],
    ["ExternalServiceException-like 502", 502],
  ])("treats a CustomException with status >= 500 (%s) as unexpected", async (_l, code) => {
    service().mockRejectedValue(
      new CustomException("relation verifywise.secret_table does not exist", {
        statusCode: code,
      }),
    );
    const { status, body } = await call(handler(), req);
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toMatch(/secret_table/);
    expect(logCentralOnly).toHaveBeenCalledTimes(1);
    expect(logCentralOnly.mock.calls[0][1]).toContain("secret_table");
    expect(errorEvents()).toEqual([
      ["Error", `${name} failed: stance generation failed unexpectedly`, 9, 42],
    ]);
    expect(seen(logStructured) + seen(logEvent)).not.toMatch(/secret_table/);
  });

  it("writes the local record to stderr, not the transport-less default logger, in production", async () => {
    const raw = new Error("chromium crashed at /srv/secret/path");
    service().mockRejectedValue(raw);
    const stderr = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const devTransports = serverLogger.transports;
    serverLogger.transports = [];
    let stderrCalls: unknown[][];
    try {
      const { status, body } = await call(handler(), req);
      expect(status).toBe(500);
      expect(body.error).toBe("Internal server error");
    } finally {
      serverLogger.transports = devTransports;
      stderrCalls = [...stderr.mock.calls];
      stderr.mockRestore();
    }
    const text = logCentralOnly.mock.calls[0][1];
    expect(text).toContain("chromium crashed at /srv/secret/path");
    expect(stderrCalls).toEqual([[text]]);
    expect(serverLogger.error).not.toHaveBeenCalled();
  });

  it("still answers a generic 500 when the console logger throws", async () => {
    service().mockRejectedValue(new Error("chromium crashed at /srv/secret/path"));
    serverLogger.error.mockImplementationOnce(() => {
      throw new Error("disk full at /var/log/secret");
    });
    const { status, body } = await call(handler(), req);
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(logCentralOnly).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it("still answers a generic 500 when the central log throws", async () => {
    service().mockRejectedValue(new Error("chromium crashed at /srv/secret/path"));
    logCentralOnly.mockImplementationOnce(() => {
      throw new Error("exporter down at /var/log/secret");
    });
    const { status, body } = await call(handler(), req);
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it("still answers a generic 500 when the event log or the tenant log fails", async () => {
    service().mockRejectedValue(new Error("chromium crashed at /srv/secret/path"));
    logEvent.mockRejectedValueOnce(new Error("log store down at /var/log/secret"));
    const stderr = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let status: number;
    let body: any;
    try {
      ({ status, body } = await call(handler(), req));
      expect(status).toBe(500);
      expect(JSON.stringify(body)).not.toMatch(/secret/);

      logStructured.mockImplementation((state: unknown) => {
        if (state === "error") throw new Error("tenant log dir gone at /var/log/secret");
      });
      ({ status, body } = await call(handler(), req));
    } finally {
      logStructured.mockReset();
      stderr.mockRestore();
    }
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(JSON.stringify(body)).not.toMatch(/secret/);
  });

  it("answers 201 and still writes the Create event when every log line throws", async () => {
    const created = { stanceId: 3, version: 1, sha256: "a" };
    service().mockResolvedValue(created);
    logStructured.mockImplementation(() => {
      throw new Error("exporter down at /var/log/secret");
    });
    serverLogger.debug.mockImplementation(() => {
      throw new Error("console gone");
    });
    const stderr = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let answer: Awaited<ReturnType<typeof call>>;
    try {
      answer = await call(handler(), req);
    } finally {
      logStructured.mockReset();
      serverLogger.debug.mockReset();
      stderr.mockRestore();
    }
    expect(answer.status).toBe(201);
    expect(answer.body.data).toEqual(created);
    expect(logEvent.mock.calls.filter((c) => c[0] === "Create")).toHaveLength(1);
    expect(errorEvents()).toEqual([]);
    expect(logCentralOnly).not.toHaveBeenCalled();
  });

  it("still writes a refusal's Error event when every log line throws", async () => {
    service().mockRejectedValue(new ConflictException("raced"));
    logStructured.mockImplementation(() => {
      throw new Error("exporter down");
    });
    serverLogger.error.mockImplementation(() => {
      throw new Error("console gone");
    });
    const stderr = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let answer: Awaited<ReturnType<typeof call>>;
    try {
      answer = await call(handler(), req);
    } finally {
      logStructured.mockReset();
      serverLogger.error.mockReset();
      stderr.mockRestore();
    }
    expect(answer.status).toBe(409);
    expect(errorEvents()).toEqual([["Error", `${name} failed: raced`, 9, 42]]);
  });

  it("answers 201 with the stance when the success event write rejects", async () => {
    const created = { stanceId: 3, version: 1, sha256: "a" };
    service().mockResolvedValue(created);
    logEvent.mockRejectedValueOnce(new Error("log store down at /var/log/secret"));
    const stderr = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let answer: Awaited<ReturnType<typeof call>>;
    try {
      answer = await call(handler(), req);
    } finally {
      stderr.mockRestore();
    }
    expect(answer.status).toBe(201);
    expect(answer.body.data).toEqual(created);
    expect(errorLines()).toEqual([]);
    expect(errorEvents()).toEqual([]);
    expect(logCentralOnly).not.toHaveBeenCalled();
  });

  it("logs an expected refusal once, as thrown, and answers with its own status and message", async () => {
    service().mockRejectedValue(new ConflictException("raced"));
    const { status, body } = await call(handler(), req);
    expect(status).toBe(409);
    expect(body.data).toBe("raced");
    expect(logCentralOnly).not.toHaveBeenCalled();
    expect(serverLogger.error).toHaveBeenCalledTimes(1);
    expect(errorLines()).toHaveLength(1);
    expect(errorEvents()).toEqual([["Error", `${name} failed: raced`, 9, 42]]);
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

  it("answers an unexpected failure with a generic translated 500, recording the cause once, centrally", async () => {
    const internal = new Error('relation "files" does not exist at character 112');
    svc(stanceService.getStanceDownload).mockRejectedValue(internal);
    const t = jest.fn((key: string) => `translated:${key}`);
    const { status, body } = await call(ctrl.downloadStance, mockReq({ params: { id: "3" }, t }));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/relation|character 112/);
    expect(body.error).toBe("translated:Internal server error");
    expect(t).toHaveBeenCalledWith("Internal server error");

    // The cause: once on the central stack and once in the local record.
    expect(logCentralOnly).toHaveBeenCalledTimes(1);
    const [state, text, functionName] = logCentralOnly.mock.calls[0] as string[];
    expect([state, functionName]).toEqual(["error", "downloadStance"]);
    expect(text).toContain('relation "files" does not exist at character 112');
    expect(serverLogger.error).toHaveBeenCalledTimes(1);
    expect(serverLogger.error.mock.calls[0][0]).toBe(text);

    // The org-readable tenant log gets one generic line; a "Read" writes no event.
    expect(logStructured.mock.calls.filter((c) => c[0] === "error")).toEqual([
      ["error", "downloadStance failed", "downloadStance", "biasAudit.ctrl.ts"],
    ]);
    expect(logEvent).not.toHaveBeenCalled();
    expect(JSON.stringify(logStructured.mock.calls)).not.toMatch(/relation|character 112/);
  });

  it("answers a 5xx CustomException with the generic 500, not its message", async () => {
    svc(stanceService.getStanceDownload).mockRejectedValue(
      new CustomException("pool exhausted at db.internal:5432", {
        code: "DATABASE_ERROR",
        statusCode: 500,
      }),
    );
    const { status, body } = await call(ctrl.downloadStance, mockReq({ params: { id: "3" } }));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/db\.internal/);
    expect(logCentralOnly).toHaveBeenCalledTimes(1);
    expect(logCentralOnly.mock.calls[0][1]).toContain("db.internal");
    expect(JSON.stringify(logStructured.mock.calls)).not.toMatch(/db\.internal/);
  });

  it("logs a client refusal as thrown, with nothing on the central stack", async () => {
    svc(stanceService.getStanceDownload).mockRejectedValue(new NotFoundException("nope"));
    const { status } = await call(ctrl.downloadStance, mockReq({ params: { id: "3" } }));
    expect(status).toBe(404);
    expect(logCentralOnly).not.toHaveBeenCalled();
    expect(logStructured.mock.calls.filter((c) => c[0] === "error")).toHaveLength(1);
  });

  it("sends the PDF when every log line throws", async () => {
    const pdf = Buffer.from("%PDF-1.4");
    svc(stanceService.getStanceDownload).mockResolvedValue({
      filename: "s.pdf",
      content: pdf,
      sha256: "f".repeat(64),
    });
    logStructured.mockImplementation(() => {
      throw new Error("exporter down");
    });
    const stderr = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let answer: Awaited<ReturnType<typeof call>>;
    try {
      answer = await call(ctrl.downloadStance, mockReq({ params: { id: "3" } }));
    } finally {
      logStructured.mockReset();
      stderr.mockRestore();
    }
    expect(answer.res.status).toHaveBeenCalledWith(200);
    expect(answer.res.send).toHaveBeenCalledWith(pdf);
  });

  it("sends the PDF when the success log throws", async () => {
    const pdf = Buffer.from("%PDF-1.4");
    svc(stanceService.getStanceDownload).mockResolvedValue({
      filename: "s.pdf",
      content: pdf,
      sha256: "f".repeat(64),
    });
    logStructured.mockImplementation((state: unknown) => {
      if (state === "successful") throw new Error("tenant log dir gone");
    });
    let answer: Awaited<ReturnType<typeof call>>;
    try {
      answer = await call(ctrl.downloadStance, mockReq({ params: { id: "3" } }));
    } finally {
      logStructured.mockReset();
    }
    expect(answer.res.status).toHaveBeenCalledWith(200);
    expect(answer.res.send).toHaveBeenCalledWith(pdf);
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

describe("the caller's role reaches every project endpoint", () => {
  const as = { role: "Editor" };
  const params = { projectId: "7", frameworkId: LL144 };
  const seen = (fn: unknown) => (fn as jest.Mock).mock.calls[0];

  it("passes the role, never a role from the request body", async () => {
    svc(profileService.getProfileView).mockResolvedValue({});
    svc(profileService.attestProfile).mockResolvedValue({ profileId: 1, version: 1 });
    svc(runService.listRuns).mockResolvedValue({ runs: [] });
    svc(runService.getTrendSeries).mockResolvedValue({ segments: [], breaks: [] });
    svc(runService.getRunView).mockResolvedValue({});
    svc(runService.confirmDerivedBasis).mockResolvedValue({ runId: 5, derivedBasis: {} });
    svc(stanceService.generateStance).mockResolvedValue({ stanceId: 3, version: 1, sha256: "a" });

    const body = { role: "Admin" };
    await call(ctrl.getProfile, mockReq({ ...as, params, body }));
    await call(ctrl.attestProfile, mockReq({ ...as, params, body }));
    const q = { projectId: "7", frameworkId: LL144 };
    await call(ctrl.listRuns, mockReq({ ...as, query: q, body }));
    await call(ctrl.getRunTrend, mockReq({ ...as, query: q, body }));
    await call(ctrl.getRun, mockReq({ ...as, params: { id: "5" }, body }));
    await call(ctrl.confirmDerivedBasis, mockReq({ ...as, params: { id: "5" }, body }));
    await call(ctrl.generateStance, mockReq({ ...as, params: { id: "5" }, body }));

    expect(seen(profileService.getProfileView)[0]).toMatchObject({ role: "Editor", userId: 9 });
    expect(seen(profileService.attestProfile)[0]).toMatchObject({ role: "Editor", userId: 9 });
    expect(seen(runService.listRuns)[0]).toMatchObject({ role: "Editor", userId: 9 });
    expect(seen(runService.getTrendSeries)[0]).toMatchObject({ role: "Editor", userId: 9 });
    expect(seen(runService.getRunView)[2]).toEqual({ userId: 9, role: "Editor" });
    expect(seen(runService.confirmDerivedBasis)[2]).toEqual({ userId: 9, role: "Editor" });
    expect(seen(stanceService.generateStance)[0]).toMatchObject({ role: "Editor", userId: 9 });
  });

  it("maps a service 404 for a non-member to 404 on a write", async () => {
    svc(profileService.saveAnswers).mockRejectedValue(
      new NotFoundException("Project 7 was not found"),
    );
    const { status } = await call(
      ctrl.saveProfileAnswers,
      mockReq({ ...as, params, body: { answers: [] } }),
    );
    expect(status).toBe(404);
  });
});

// --------------------------------------------------------------- corpora

describe("createCorpus", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    projectId: 7,
    frameworkId: 12,
    jobDescriptionKey: "commercial-ae",
    ...over,
  });
  const started = () => svc(corpusService.startCorpusGeneration).mock.calls[0][0];

  it("defaults the count to 5000 and passes the caller's organization and role", async () => {
    svc(corpusService.startCorpusGeneration).mockResolvedValue({ corpusId: 3 });
    const { status, body: res } = await call(
      ctrl.createCorpus,
      mockReq({ role: "Editor", body: body({ organizationId: 999, role: "Admin" }) }),
    );
    expect(status).toBe(201);
    expect(res.data).toEqual({ corpusId: 3 });
    expect(started()).toEqual({
      projectId: 7,
      frameworkId: 12,
      organizationId: 42,
      userId: 9,
      role: "Editor",
      jobDescriptionKey: "commercial-ae",
      criteriaSupplied: null,
      count: 5000,
    });
  });

  it.each([[699], [10001], ["abc"], [700.5], [0], [-700], [null], [true]])(
    "400s a count of %p without calling the service",
    async (count) => {
      const { status } = await call(ctrl.createCorpus, mockReq({ body: body({ count }) }));
      expect(status).toBe(400);
      expect(corpusService.startCorpusGeneration).not.toHaveBeenCalled();
    },
  );

  it.each([[700], [10000], ["2500"]])("accepts a count of %p", async (count) => {
    svc(corpusService.startCorpusGeneration).mockResolvedValue({ corpusId: 3 });
    const { status } = await call(ctrl.createCorpus, mockReq({ body: body({ count }) }));
    expect(status).toBe(201);
    expect(started().count).toBe(Number(count));
  });

  it("400s a job description outside the two keys and a framework other than LL 144", async () => {
    for (const over of [
      { jobDescriptionKey: "nurse" },
      { jobDescriptionKey: undefined },
      { frameworkId: 15 },
      { frameworkId: "abc" },
    ]) {
      const { status } = await call(ctrl.createCorpus, mockReq({ body: body(over) }));
      expect(status).toBe(400);
    }
    expect(corpusService.startCorpusGeneration).not.toHaveBeenCalled();
  });

  it("passes criteria text through, treats blank as not supplied, and 400s over 10,000 characters", async () => {
    svc(corpusService.startCorpusGeneration).mockResolvedValue({ corpusId: 3 });
    await call(ctrl.createCorpus, mockReq({ body: body({ criteriaSupplied: "Quota\nClosing" }) }));
    expect(started().criteriaSupplied).toBe("Quota\nClosing");
    svc(corpusService.startCorpusGeneration).mockClear();
    await call(ctrl.createCorpus, mockReq({ body: body({ criteriaSupplied: "   " }) }));
    expect(started().criteriaSupplied).toBeNull();
    svc(corpusService.startCorpusGeneration).mockClear();

    for (const criteriaSupplied of ["x".repeat(10001), 42, ["a"]]) {
      const { status } = await call(
        ctrl.createCorpus,
        mockReq({ body: body({ criteriaSupplied }) }),
      );
      expect(status).toBe(400);
    }
    expect(corpusService.startCorpusGeneration).not.toHaveBeenCalled();
    const { status } = await call(
      ctrl.createCorpus,
      mockReq({ body: body({ criteriaSupplied: "x".repeat(10000) }) }),
    );
    expect(status).toBe(201);
  });

  describe("when the gateway is not configured", () => {
    const prior = process.env.BIAS_AUDIT_LLM_API_KEY;
    afterEach(() => {
      if (prior === undefined) delete process.env.BIAS_AUDIT_LLM_API_KEY;
      else process.env.BIAS_AUDIT_LLM_API_KEY = prior;
    });

    it.each([
      ["missing", () => new GatewayNotConfiguredError(["BIAS_AUDIT_LLM_BASE_URL"])],
      ["invalid", () => new GatewayConfigError("BIAS_AUDIT_LLM_BASE_URL", "must use https")],
    ])("answers 503 when the configuration is %s, with no key in the body", async (_l, make) => {
      process.env.BIAS_AUDIT_LLM_API_KEY = "sk-ctrl-secret"; // gitleaks:allow
      svc(corpusService.startCorpusGeneration).mockRejectedValue(make());
      const { status, body: res } = await call(ctrl.createCorpus, mockReq({ body: body() }));
      expect(status).toBe(503);
      expect(JSON.stringify(res)).toMatch(/not available on this deployment/);
      expect(JSON.stringify(res)).not.toContain("sk-ctrl-secret");
      expect(JSON.stringify(res)).not.toContain("BIAS_AUDIT_LLM");
      const logged = JSON.stringify([
        logStructured.mock.calls,
        logCentralOnly.mock.calls,
        serverLogger.error.mock.calls,
        logEvent.mock.calls,
      ]);
      expect(logged).not.toContain("sk-ctrl-secret");
    });
  });

  it("passes the generation gate's 409 through with its message", async () => {
    svc(corpusService.startCorpusGeneration).mockRejectedValue(
      new ConflictException("pipeline.input_form is audio", "AedtProfile", "pipeline.input_form"),
    );
    const { status, body: res } = await call(ctrl.createCorpus, mockReq({ body: body() }));
    expect(status).toBe(409);
    expect(res.data).toMatch(/pipeline\.input_form is audio/);
  });

  it("answers an unexpected failure with a generic 500, keeping the raw text out", async () => {
    svc(corpusService.startCorpusGeneration).mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
    );
    const { status, body: res } = await call(ctrl.createCorpus, mockReq({ body: body() }));
    expect(status).toBe(500);
    expect(JSON.stringify(res)).not.toContain("ECONNREFUSED");
  });
});

describe("compareCriteria", () => {
  it("returns the comparison for the job description and stores nothing", async () => {
    const { status, body } = await call(
      ctrl.compareCriteria,
      mockReq({ body: { jobDescriptionKey: "operational-hourly", criteriaSupplied: null } }),
    );
    expect(status).toBe(200);
    expect(body.data.verdict).toBe("not_supplied");
    expect(corpusService.startCorpusGeneration).not.toHaveBeenCalled();
  });

  it("400s an unknown job description", async () => {
    const { status } = await call(
      ctrl.compareCriteria,
      mockReq({ body: { jobDescriptionKey: "nurse", criteriaSupplied: "x" } }),
    );
    expect(status).toBe(400);
  });
});

describe("corpus reads and resume", () => {
  it("lists corpora for a project as the caller, 404ing another framework", async () => {
    svc(corpusService.listCorpora).mockResolvedValue({ corpora: [] });
    const q = { projectId: "7", frameworkId: LL144 };
    const { status } = await call(ctrl.listCorpora, mockReq({ role: "Editor", query: q }));
    expect(status).toBe(200);
    expect(svc(corpusService.listCorpora).mock.calls[0][0]).toEqual({
      projectId: 7,
      frameworkId: 12,
      organizationId: 42,
      userId: 9,
      role: "Editor",
    });
    const other = await call(ctrl.listCorpora, mockReq({ query: { ...q, frameworkId: "15" } }));
    expect(other.status).toBe(404);
  });

  it("views a corpus by id in the caller's organization, 400ing a bad id", async () => {
    svc(corpusService.getCorpusView).mockResolvedValue({ id: 3 });
    const { status } = await call(ctrl.getCorpus, mockReq({ role: "Editor", params: { id: "3" } }));
    expect(status).toBe(200);
    expect(svc(corpusService.getCorpusView).mock.calls[0]).toEqual([
      3,
      42,
      { userId: 9, role: "Editor" },
    ]);
    expect((await call(ctrl.getCorpus, mockReq({ params: { id: "x" } }))).status).toBe(400);
  });

  it("resumes as the caller and passes a 409 through", async () => {
    svc(corpusService.resumeCorpus).mockResolvedValue({ corpusId: 3, status: "running" });
    const ok = await call(ctrl.resumeCorpus, mockReq({ params: { id: "3" } }));
    expect(ok.status).toBe(202);
    expect(svc(corpusService.resumeCorpus).mock.calls[0]).toEqual([
      3,
      42,
      { userId: 9, role: "Admin" },
    ]);
    svc(corpusService.resumeCorpus).mockRejectedValue(
      new ConflictException("Corpus 3 is already running.", "Corpus"),
    );
    const busy = await call(ctrl.resumeCorpus, mockReq({ params: { id: "3" } }));
    expect(busy.status).toBe(409);
    expect(busy.body.data).toMatch(/already running/);
  });

  it("maps a corpus the caller cannot see to 404", async () => {
    svc(corpusService.getCorpusView).mockRejectedValue(
      new NotFoundException("Corpus 3 was not found", "Corpus", 3),
    );
    expect((await call(ctrl.getCorpus, mockReq({ params: { id: "3" } }))).status).toBe(404);
  });

  it("answers the job descriptions view, and no corpus handler sends apiKey", async () => {
    svc(corpusService.getJobDescriptionsView).mockReturnValue({
      jobDescriptions: [{ key: "commercial-ae" }],
      generationAvailable: true,
      count: { default: 5000, min: 700, max: 10000 },
    });
    svc(corpusService.listCorpora).mockResolvedValue({ corpora: [{ id: 3 }] });
    svc(corpusService.getCorpusView).mockResolvedValue({ id: 3 });
    svc(corpusService.resumeCorpus).mockResolvedValue({ corpusId: 3, status: "running" });
    svc(corpusService.startCorpusGeneration).mockResolvedValue({ corpusId: 3 });

    const jd = await call(ctrl.getJobDescriptions, mockReq());
    expect(jd.status).toBe(200);
    expect(jd.body.data.generationAvailable).toBe(true);
    const bodies = [
      jd.body,
      (await call(ctrl.listCorpora, mockReq({ query: { projectId: "7", frameworkId: LL144 } })))
        .body,
      (await call(ctrl.getCorpus, mockReq({ params: { id: "3" } }))).body,
      (await call(ctrl.resumeCorpus, mockReq({ params: { id: "3" } }))).body,
      (
        await call(
          ctrl.createCorpus,
          mockReq({ body: { projectId: 7, frameworkId: 12, jobDescriptionKey: "commercial-ae" } }),
        )
      ).body,
    ];
    for (const b of bodies) expect(JSON.stringify(b)).not.toContain("apiKey");
  });
});

describe("downloadCorpus", () => {
  function streamRes() {
    const res = mockRes();
    res.write = jest.fn(() => true);
    res.end = jest.fn(() => res);
    res.destroy = jest.fn();
    res.once = jest.fn();
    res.off = jest.fn();
    res.headersSent = false;
    return res;
  }

  it("sends the CSV the service streams, as an attachment", async () => {
    svc(corpusService.streamCorpusDownload).mockImplementation(
      async (_id: number, _org: number, _v: unknown, write: (c: string) => unknown) => {
        await write("candidate_id,artifact_kind,artifact\r\n");
        await write("C0001,resume,text\r\n");
      },
    );
    const res = streamRes();
    await ctrl.downloadCorpus(mockReq({ params: { id: "3" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="corpus-3.csv"',
    );
    expect(res.write.mock.calls.map((c: unknown[]) => c[0]).join("")).toBe(
      "candidate_id,artifact_kind,artifact\r\nC0001,resume,text\r\n",
    );
    expect(res.end).toHaveBeenCalled();
    expect(svc(corpusService.streamCorpusDownload).mock.calls[0].slice(0, 3)).toEqual([
      3,
      42,
      { userId: 9, role: "Admin" },
    ]);
  });

  it("answers a refusal before any byte with its own status and JSON", async () => {
    svc(corpusService.streamCorpusDownload).mockRejectedValue(
      new ConflictException("Only a complete corpus can be downloaded.", "Corpus"),
    );
    const res = streamRes();
    await ctrl.downloadCorpus(mockReq({ params: { id: "3" } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.write).not.toHaveBeenCalled();
  });

  it("aborts the response, rather than ending it, when the stream fails part way", async () => {
    svc(corpusService.streamCorpusDownload).mockImplementation(
      async (_id: number, _org: number, _v: unknown, write: (c: string) => unknown) => {
        await write("candidate_id,artifact_kind,artifact\r\n");
        throw new Error("The downloadable records do not match");
      },
    );
    const res = streamRes();
    await ctrl.downloadCorpus(mockReq({ params: { id: "3" } }), res);
    expect(res.destroy).toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
