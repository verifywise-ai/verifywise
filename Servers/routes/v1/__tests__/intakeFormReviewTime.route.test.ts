import request from "supertest";
import express from "express";

jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.t = (key: string, vars?: Record<string, string | number>) =>
      key.replace(/\{(\w+)\}/g, (_: string, k: string) => String(vars?.[k] ?? `{${k}}`));
    next();
  },
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
jest.mock("../../../utils/intakeForm.utils", () => ({
  getFormReviewDaysQuery: jest.fn(),
  updateFormReviewDaysQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import routes from "../intakeFormReviewTime.route";
import { getFormReviewDaysQuery, updateFormReviewDaysQuery } from "../../../utils/intakeForm.utils";

const mockGet = getFormReviewDaysQuery as jest.MockedFunction<typeof getFormReviewDaysQuery>;
const mockUpdate = updateFormReviewDaysQuery as jest.MockedFunction<
  typeof updateFormReviewDaysQuery
>;

const app = express();
app.use(express.json());
app.use("/api/v1/intake-form-review-time", routes);

describe("/api/v1/intake-form-review-time/:formId", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("GET", () => {
    it("returns the form's review time, scoped to the caller's organization", async () => {
      mockGet.mockResolvedValue(5);
      const res = await request(app).get("/api/v1/intake-form-review-time/7");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ formId: 7, reviewDays: 5 });
      expect(mockGet).toHaveBeenCalledWith(7, 42);
    });

    it("is open to roles that cannot edit forms, like reading the form", async () => {
      mockGet.mockResolvedValue(3);
      const res = await request(app).get("/api/v1/intake-form-review-time/7").set("x-no-edit", "1");
      expect(res.status).toBe(200);
    });

    it("answers 404 for an unknown form and 400 for a bad id", async () => {
      mockGet.mockResolvedValue(null);
      expect((await request(app).get("/api/v1/intake-form-review-time/7")).status).toBe(404);
      expect((await request(app).get("/api/v1/intake-form-review-time/7x")).status).toBe(400);
      expect((await request(app).get("/api/v1/intake-form-review-time/0")).status).toBe(400);
    });
  });

  describe("PUT", () => {
    it("stores a valid review time", async () => {
      mockUpdate.mockResolvedValue(10);
      const res = await request(app)
        .put("/api/v1/intake-form-review-time/7")
        .send({ reviewDays: 10 });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ formId: 7, reviewDays: 10 });
      expect(mockUpdate).toHaveBeenCalledWith(7, 42, 10);
    });

    it("needs the permission to edit intake forms", async () => {
      const res = await request(app)
        .put("/api/v1/intake-form-review-time/7")
        .set("x-no-edit", "1")
        .send({ reviewDays: 10 });
      expect(res.status).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it.each([0, 31, 2.5, "3", null])("rejects %p with the allowed range", async (reviewDays) => {
      const res = await request(app).put("/api/v1/intake-form-review-time/7").send({ reviewDays });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain(
        "Review time must be a whole number of business days from 1 to 30",
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("answers 404 for an unknown form", async () => {
      mockUpdate.mockResolvedValue(null);
      const res = await request(app)
        .put("/api/v1/intake-form-review-time/7")
        .send({ reviewDays: 4 });
      expect(res.status).toBe(404);
    });
  });
});
