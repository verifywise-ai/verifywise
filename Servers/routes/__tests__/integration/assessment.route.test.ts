import { describe, it, expect, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../../controllers/assessment.ctrl", () => ({
  getAllAssessments: jest.fn((_req: any, res: any) =>
    res.status(200).json([{ id: 1, name: "Assessment A" }]),
  ),
  getAnswers: jest.fn((_req: any, res: any) => res.status(200).json({ answers: [] })),
  getAssessmentById: jest.fn((_req: any, res: any) =>
    res.status(200).json({ id: 1, name: "Assessment A" }),
  ),
  getAssessmentByProjectId: jest.fn((_req: any, res: any) =>
    res.status(200).json({ id: 1, projectId: 1 }),
  ),
  createAssessment: jest.fn((_req: any, res: any) =>
    res.status(201).json({ id: 1, name: "Assessment A" }),
  ),
  updateAssessmentById: jest.fn((_req: any, res: any) =>
    res.status(200).json({ id: 1, name: "Assessment A" }),
  ),
  deleteAssessmentById: jest.fn((_req: any, res: any) =>
    res.status(200).json({ id: 1, name: "Assessment A" }),
  ),
}));

jest.mock("../../../middleware/auth.middleware", () =>
  jest.fn((_req: any, _res: any, next: any) => next()),
);

import assessmentRoutes from "../../assessment.route";

function createAssessmentTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use("/api/assessments", assessmentRoutes);
  return app;
}

describe("GET /api/assessments", () => {
  it("should return 200 with assessment list", async () => {
    const app = createAssessmentTestApp();
    const res = await request(app).get("/api/assessments");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/assessments/:id", () => {
  it("should return 200 with assessment data", async () => {
    const app = createAssessmentTestApp();
    const res = await request(app).get("/api/assessments/1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
  });
});

describe("GET /api/assessments/getAnswers/:id", () => {
  it("should return 200 with answers", async () => {
    const app = createAssessmentTestApp();
    const res = await request(app).get("/api/assessments/getAnswers/1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("answers");
  });
});

describe("GET /api/assessments/project/byid/:id", () => {
  it("should return 200 with project assessment", async () => {
    const app = createAssessmentTestApp();
    const res = await request(app).get("/api/assessments/project/byid/1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("projectId");
  });
});
