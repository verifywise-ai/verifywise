import { describe, it, expect, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../../controllers/project.ctrl", () => ({
  allProjectsAssessmentProgress: jest.fn((_req: any, res: any) =>
    res.status(200).json({ progress: 80 }),
  ),
  allProjectsComplianceProgress: jest.fn((_req: any, res: any) =>
    res.status(200).json({ progress: 90 }),
  ),
  createProject: jest.fn((_req: any, res: any) => res.status(201).json({ id: 1 })),
  deleteProjectById: jest.fn((_req: any, res: any) => res.status(204).send()),
  getAllProjects: jest.fn((_req: any, res: any) =>
    res.status(200).json([{ id: 1, name: "Alpha" }]),
  ),
  getCompliances: jest.fn((_req: any, res: any) => res.status(200).json([{ id: 1 }])),
  getProjectById: jest.fn((_req: any, res: any) => res.status(200).json({ id: 1, name: "Alpha" })),
  getProjectRisksCalculations: jest.fn((_req: any, res: any) => res.status(200).json({ risks: 5 })),
  getProjectStatsById: jest.fn((_req: any, res: any) => res.status(200).json({ stats: {} })),
  getVendorRisksCalculations: jest.fn((_req: any, res: any) =>
    res.status(200).json({ vendorRisks: 2 }),
  ),
  projectAssessmentProgress: jest.fn((_req: any, res: any) =>
    res.status(200).json({ progress: 70 }),
  ),
  projectComplianceProgress: jest.fn((_req: any, res: any) =>
    res.status(200).json({ progress: 85 }),
  ),
  updateProjectById: jest.fn((_req: any, res: any) => res.status(200).json({ updated: true })),
  updateProjectStatus: jest.fn((_req: any, res: any) => res.status(200).json({ status: "active" })),
}));

jest.mock("../../../middleware/auth.middleware", () =>
  jest.fn((_req: any, _res: any, next: any) => next()),
);

import projectRoutes from "../../project.route";

function createProjectTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use("/api/projects", projectRoutes);
  return app;
}

describe("GET /api/projects", () => {
  it("should return 200 with project list", async () => {
    const app = createProjectTestApp();
    const res = await request(app).get("/api/projects");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/projects/:id", () => {
  it("should return 200 with project data", async () => {
    const app = createProjectTestApp();
    const res = await request(app).get("/api/projects/1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
  });
});

describe("POST /api/projects", () => {
  it("should return 201 when body is valid", async () => {
    const app = createProjectTestApp();
    const res = await request(app).post("/api/projects").send({ name: "New Project" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
  });
});

describe("PATCH /api/projects/:id", () => {
  it("should return 200", async () => {
    const app = createProjectTestApp();
    const res = await request(app).patch("/api/projects/1").send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("updated");
  });
});

describe("DELETE /api/projects/:id", () => {
  it("should return 204", async () => {
    const app = createProjectTestApp();
    const res = await request(app).delete("/api/projects/1");

    expect(res.status).toBe(204);
  });
});
