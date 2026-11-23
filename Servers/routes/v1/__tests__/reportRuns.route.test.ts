import request from "supertest";
import express from "express";

// The token decides who and which organization: x-role / x-org / x-user stand
// in for its claims; no Authorization header is a 401, as with the real
// middleware.
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ message: "Unauthorized" });
    req.userId = Number(req.headers["x-user"] ?? 9);
    req.organizationId = Number(req.headers["x-org"] ?? 42);
    req.role = req.headers["x-role"] ?? "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
// Run 77 belongs to organization 42 and covers a project user 9 is a member
// of; user 10 is not. Run 78 has no fix-it list.
jest.mock("../../../utils/reportRun.utils", () => ({
  canViewRunQuery: jest.fn(
    async (id: number, org: number, viewer: { userId: number | null; role: string | null }) =>
      [77, 78].includes(id) && org === 42 && (viewer.role === "Admin" || viewer.userId === 9),
  ),
  getRunQuery: jest.fn(async (id: number, org: number) => {
    if (org !== 42) return null;
    if (id === 77) {
      return {
        id: 77,
        file_id: 500,
        companion_file_id: 501,
        companion_filename: "E23 report_fix-it-list.pdf",
        companion_mime_type: "application/pdf",
      };
    }
    return id === 78 ? { id: 78, file_id: 500, companion_file_id: null } : null;
  }),
}));
jest.mock("../../../utils/fileUpload.utils", () => ({
  getFileById: jest.fn(async (id: number, org: number) =>
    org === 42 ? { id, filename: "stored" } : null,
  ),
}));
jest.mock("../../../services/storage", () => ({
  resolveFileContent: jest.fn(async () => Buffer.from("fix-it")),
}));
jest.mock("../../../utils/reportRunAnalysis.utils", () => ({
  getRunAnalysesQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import routes from "../reportRuns.route";
import { canViewRunQuery, getRunQuery } from "../../../utils/reportRun.utils";
import { getFileById } from "../../../utils/fileUpload.utils";

const app = express();
app.use(express.json());
app.use("/api/v1/report-runs", routes);

const url = (id: number) => `/api/v1/report-runs/${id}/download/fix-it-list`;
const auth = { Authorization: "Bearer t" };

describe("/api/v1/report-runs/:id/download/fix-it-list", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 401 without a token", async () => {
    expect((await request(app).get(url(77))).status).toBe(401);
    expect(canViewRunQuery).not.toHaveBeenCalled();
  });

  it("serves the run's fix-it list, not its formal report", async () => {
    const res = await request(app).get(url(77)).set(auth);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="E23 report_fix-it-list.pdf"',
    );
    expect(getFileById).toHaveBeenCalledWith(501, 42);
  });

  it("answers 404, not 403, to a member who may not see the run", async () => {
    // A 403 would confirm the run exists.
    const res = await request(app)
      .get(url(77))
      .set(auth)
      .set("x-role", "Editor")
      .set("x-user", "10");
    expect(res.status).toBe(404);
    expect(getRunQuery).not.toHaveBeenCalled();
    expect(getFileById).not.toHaveBeenCalled();
  });

  it("answers 404 for another organization's run", async () => {
    const res = await request(app).get(url(77)).set(auth).set("x-org", "7");
    expect(res.status).toBe(404);
    expect((canViewRunQuery as jest.Mock).mock.calls[0].slice(0, 2)).toEqual([77, 7]);
    expect(getFileById).not.toHaveBeenCalled();
  });

  it("answers 404 for a run without a fix-it list, never falling back to the report", async () => {
    const res = await request(app).get(url(78)).set(auth);
    expect(res.status).toBe(404);
    expect(getFileById).not.toHaveBeenCalled();
  });
});
