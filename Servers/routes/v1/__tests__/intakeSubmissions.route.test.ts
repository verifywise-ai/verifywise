import request from "supertest";
import express from "express";

const auth = jest.fn((req: any, _res: any, next: any) => {
  req.userId = 9;
  req.organizationId = 42;
  next();
});
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, res: any, next: any) => auth(req, res, next),
}));
// The real middleware checks the role's permission; here a header stands in
// for a role without intakeForm.edit.
jest.mock("../../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn(
    (permission: string) => (req: any, res: any, next: any) =>
      permission === "intakeForm.edit" && req.headers["x-no-edit"]
        ? res.status(403).json({ message: "Forbidden" })
        : next(),
  ),
}));
// Decision 5: someone else's submission is a 404 unless the caller manages
// intake; a header stands in for "not the caller's own submission".
jest.mock("../../../middleware/intakeSubmissionAccess.middleware", () => ({
  requireOwnSubmissionOrIntakeManager: (req: any, res: any, next: any) =>
    req.headers["x-no-edit"] && req.headers["x-not-own"]
      ? res.status(404).json({ message: "Submission not found" })
      : next(),
}));
jest.mock("../../../controllers/intakeForm.ctrl", () => ({
  getSubmissionPreviewV1: jest.fn((req: any, res: any) =>
    res.status(200).json({ route: "preview", id: req.params.id }),
  ),
  approveSubmissionV1: jest.fn((req: any, res: any) =>
    res.status(200).json({ route: "approve", id: req.params.id }),
  ),
}));

import routes from "../intakeSubmissions.route";

const app = express();
app.use(express.json());
app.use("/api/v1/intake-submissions", routes);

describe("/api/v1/intake-submissions (#5262)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("previews one's own submission without intakeForm.edit, like the legacy route", async () => {
    const res = await request(app)
      .get("/api/v1/intake-submissions/5/preview")
      .set("x-no-edit", "1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ route: "preview", id: "5" });
    expect(auth).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for someone else's submission without intakeForm.edit", async () => {
    const res = await request(app)
      .get("/api/v1/intake-submissions/5/preview")
      .set("x-no-edit", "1")
      .set("x-not-own", "1");
    expect(res.status).toBe(404);
  });

  it("approves with intakeForm.edit, like the legacy route", async () => {
    const res = await request(app).post("/api/v1/intake-submissions/5/approve").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ route: "approve", id: "5" });
    expect(auth).toHaveBeenCalledTimes(1);
  });

  it("refuses approval without intakeForm.edit", async () => {
    const res = await request(app)
      .post("/api/v1/intake-submissions/5/approve")
      .set("x-no-edit", "1")
      .send({});
    expect(res.status).toBe(403);
  });
});
