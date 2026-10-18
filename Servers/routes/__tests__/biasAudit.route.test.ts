import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: jest.fn((_req: any, _res: any, next: any) => next()),
}));
jest.mock("../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn((permission: string) => {
    const mw: any = (_req: any, _res: any, next: any) => next();
    mw.permissionKey = permission;
    return mw;
  }),
}));
jest.mock("../../controllers/biasAudit.ctrl", () => ({
  getQuestions: jest.fn(),
  getProfile: jest.fn(),
  saveProfileAnswers: jest.fn(),
  attestProfile: jest.fn(),
  createRun: jest.fn(),
  listRuns: jest.fn(),
  getRunTrend: jest.fn(),
  getRun: jest.fn(),
  confirmDerivedBasis: jest.fn(),
  generateStance: jest.fn(),
  generateProfileStance: jest.fn(),
  downloadStance: jest.fn(),
  getJobDescriptions: jest.fn(),
  compareCriteria: jest.fn(),
  createCorpus: jest.fn(),
  listCorpora: jest.fn(),
  getCorpus: jest.fn(),
  downloadCorpus: jest.fn(),
  resumeCorpus: jest.fn(),
  // The real upload error mapper and limit, so the upload layer is exercised.
  handleDatasetUploadError: jest.requireActual<any>("../../controllers/biasAudit.ctrl")
    .handleDatasetUploadError,
  DATASET_MAX_BYTES: jest.requireActual<any>("../../controllers/biasAudit.ctrl").DATASET_MAX_BYTES,
}));

import express from "express";
import request from "supertest";
import router from "../biasAudit.route";
import authenticateJWT from "../../middleware/auth.middleware";
import * as ctrl from "../../controllers/biasAudit.ctrl";
import { ROLE_PERMISSIONS } from "../../config/rolePermissions.config";

function layerFor(method: string, path: string) {
  return (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
}

function handlersFor(method: string, path: string): any[] {
  const layer = layerFor(method, path);
  expect(layer).toBeDefined();
  return layer.route.stack.map((s: any) => s.handle);
}

const ROUTES: Array<[string, string, string, unknown]> = [
  ["get", "/questions/:frameworkId", "biasAudit.read", ctrl.getQuestions],
  ["get", "/profiles/:projectId/:frameworkId", "biasAudit.read", ctrl.getProfile],
  ["put", "/profiles/:projectId/:frameworkId", "biasAudit.edit", ctrl.saveProfileAnswers],
  ["post", "/profiles/:projectId/:frameworkId/attest", "biasAudit.attest", ctrl.attestProfile],
  // A scope determination is a stance: same permission as generating one from a run.
  [
    "post",
    "/profiles/:projectId/:frameworkId/stance",
    "biasAudit.edit",
    ctrl.generateProfileStance,
  ],
  ["post", "/runs", "biasAudit.edit", ctrl.createRun],
  ["get", "/runs", "biasAudit.read", ctrl.listRuns],
  ["get", "/runs/trend", "biasAudit.read", ctrl.getRunTrend],
  ["get", "/runs/:id", "biasAudit.read", ctrl.getRun],
  ["post", "/runs/:id/derived-basis/confirm", "biasAudit.attest", ctrl.confirmDerivedBasis],
  ["post", "/runs/:id/stance", "biasAudit.edit", ctrl.generateStance],
  ["get", "/stances/:id/download", "biasAudit.read", ctrl.downloadStance],
  ["get", "/job-descriptions", "biasAudit.read", ctrl.getJobDescriptions],
  ["post", "/criteria-comparison", "biasAudit.edit", ctrl.compareCriteria],
  ["post", "/corpora", "biasAudit.edit", ctrl.createCorpus],
  ["get", "/corpora", "biasAudit.read", ctrl.listCorpora],
  ["get", "/corpora/:id", "biasAudit.read", ctrl.getCorpus],
  ["get", "/corpora/:id/download", "biasAudit.read", ctrl.downloadCorpus],
  ["post", "/corpora/:id/resume", "biasAudit.edit", ctrl.resumeCorpus],
];

describe("biasAudit routes", () => {
  it("authenticates every route at the router level", () => {
    const first = (router as any).stack[0];
    expect(first.route).toBeUndefined();
    expect(first.handle).toBe(authenticateJWT);
  });

  it.each(ROUTES)("guards %s %s with %s and ends at its handler", (method, path, key, handler) => {
    const handlers = handlersFor(method, path);
    expect(handlers[0].permissionKey).toBe(key);
    expect(handlers[handlers.length - 1]).toBe(handler);
  });

  it("registers exactly the documented routes", () => {
    const registered = (router as any).stack
      .filter((l: any) => l.route)
      .flatMap((l: any) => Object.keys(l.route.methods).map((m) => `${m} ${l.route.path}`))
      .sort();
    expect(registered).toEqual(ROUTES.map(([m, p]) => `${m} ${p}`).sort());
  });

  it("declares /runs/trend before /runs/:id so the literal path is reachable", () => {
    const paths = (router as any).stack.filter((l: any) => l.route).map((l: any) => l.route.path);
    expect(paths.indexOf("/runs/trend")).toBeLessThan(paths.indexOf("/runs/:id"));
  });

  it("declares /corpora before /corpora/:id", () => {
    const paths = (router as any).stack.filter((l: any) => l.route).map((l: any) => l.route.path);
    expect(paths.indexOf("/corpora")).toBeLessThan(paths.indexOf("/corpora/:id"));
  });

  it("parses the dataset upload after the permission check and before the handler", () => {
    const handlers = handlersFor("post", "/runs");
    // authorize, multer, upload error mapper, controller
    expect(handlers).toHaveLength(4);
    expect(handlers[2]).toBe(ctrl.handleDatasetUploadError);
  });
});

describe("bias audit permission keys", () => {
  it("lets every built-in role read", () => {
    expect([...ROLE_PERMISSIONS["biasAudit.read"].legacyRoles].sort()).toEqual(
      ["Admin", "Auditor", "Editor", "Reviewer"].sort(),
    );
  });

  it("lets Admin and Editor draft, and nobody else", () => {
    expect([...ROLE_PERMISSIONS["biasAudit.edit"].legacyRoles].sort()).toEqual(
      ["Admin", "Editor"].sort(),
    );
  });

  it("lets only Admin attest", () => {
    expect([...ROLE_PERMISSIONS["biasAudit.attest"].legacyRoles]).toEqual(["Admin"]);
  });
});

describe("dataset upload layer", () => {
  const app = express();
  app.use(router);
  const received = ctrl.createRun as unknown as jest.Mock<any>;

  beforeEach(() => {
    received.mockReset();
    received.mockImplementation((req: any, res: any) =>
      res.status(201).json({ bytes: req.file.buffer.toString("hex") }),
    );
  });

  it("passes the CSV through as raw bytes, BOM included", async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a,b\n1,2\n")]);
    const res = await request(app)
      .post("/runs")
      .attach("file", bytes, { filename: "d.csv", contentType: "text/csv" });
    expect(res.status).toBe(201);
    expect(res.body.bytes).toBe(bytes.toString("hex"));
  });

  it("refuses a file over the cap with 413 before the handler runs", async () => {
    const big = Buffer.alloc((ctrl as any).DATASET_MAX_BYTES + 1, 0x61);
    const res = await request(app)
      .post("/runs")
      .attach("file", big, { filename: "d.csv", contentType: "text/csv" });
    expect(res.status).toBe(413);
    expect(res.body.data).toMatch(/30 MB/);
    expect(received).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a CSV with 415", async () => {
    const res = await request(app)
      .post("/runs")
      .attach("file", Buffer.from("%PDF"), { filename: "d.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(415);
    expect(received).not.toHaveBeenCalled();
  });

  it.each(["application/vnd.ms-excel", "text/plain", "application/octet-stream"])(
    "accepts a .csv sent as %s, as Windows browsers and other clients do",
    async (contentType) => {
      const res = await request(app)
        .post("/runs")
        .attach("file", Buffer.from("a,b\n1,2\n"), { filename: "d.csv", contentType });
      expect(res.status).toBe(201);
    },
  );

  it("refuses a spreadsheet named .xls even with the Excel type", async () => {
    const res = await request(app).post("/runs").attach("file", Buffer.from("x"), {
      filename: "d.xls",
      contentType: "application/vnd.ms-excel",
    });
    expect(res.status).toBe(415);
    expect(received).not.toHaveBeenCalled();
  });
});
