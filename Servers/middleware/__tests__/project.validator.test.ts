import { describe, it, expect } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import { validateCreateProject, validateUpdateProject } from "../validators/project.validator";

const app = express();
app.use(express.json());
app.post("/projects", validateCreateProject, (_req, res) => res.status(200).json({ ok: true }));
app.patch("/projects/:id", validateUpdateProject, (_req, res) =>
  res.status(200).json({ ok: true }),
);

const base = { project_title: "P", owner: 1, start_date: "2026-01-01T00:00:00.000Z" };
const fields = (body: any): string[] => body.data.errors.map((e: { field: string }) => e.field);

describe("project validator: high-risk roles", () => {
  it("accepts both roles on create and on update", async () => {
    await supertest(app)
      .post("/projects")
      .send({ ...base, high_risk_roles: ["Provider", "Deployer"] })
      .expect(200);
    await supertest(app)
      .patch("/projects/1")
      .send({ high_risk_roles: ["Deployer"] })
      .expect(200);
  });

  it("accepts null and an empty list", async () => {
    await supertest(app).patch("/projects/1").send({ high_risk_roles: null }).expect(200);
    await supertest(app).patch("/projects/1").send({ high_risk_roles: [] }).expect(200);
  });

  it("rejects an unknown role", async () => {
    const res = await supertest(app)
      .patch("/projects/1")
      .send({ high_risk_roles: ["Provider", "Importer"] })
      .expect(400);
    expect(fields(res.body)).toContain("high_risk_roles[1]");
  });

  it("rejects a single string instead of a list", async () => {
    const res = await supertest(app)
      .patch("/projects/1")
      .send({ high_risk_roles: "Provider" })
      .expect(400);
    expect(fields(res.body)).toContain("high_risk_roles");
  });

  it("still accepts the legacy single role", async () => {
    await supertest(app)
      .patch("/projects/1")
      .send({ type_of_high_risk_role: "Provider" })
      .expect(200);
  });
});
