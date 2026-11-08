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

describe("project validator: external owner (#5256)", () => {
  const { owner: _owner, ...noOwner } = base;
  const external = { external_owner_name: "Ada", external_owner_email: "ada@example.com" };

  it("creates with an external owner and no user owner", async () => {
    await supertest(app)
      .post("/projects")
      .send({ ...noOwner, ...external })
      .expect(200);
    await supertest(app)
      .post("/projects")
      .send({ ...noOwner, owner: null, ...external })
      .expect(200);
  });

  it("requires one kind of owner on create", async () => {
    const res = await supertest(app).post("/projects").send(noOwner).expect(400);
    expect(fields(res.body)).toContain("owner");
  });

  it("rejects a malformed external email", async () => {
    const res = await supertest(app)
      .post("/projects")
      .send({ ...noOwner, external_owner_name: "Ada", external_owner_email: "nope" })
      .expect(400);
    expect(fields(res.body)).toContain("external_owner_email");
  });

  it("rejects an overlong external name and email", async () => {
    const longName = await supertest(app)
      .patch("/projects/1")
      .send({ external_owner_name: "x".repeat(256) })
      .expect(400);
    expect(fields(longName.body)).toContain("external_owner_name");
    const longEmail = await supertest(app)
      .patch("/projects/1")
      .send({ external_owner_email: `${"x".repeat(250)}@example.com` })
      .expect(400);
    expect(fields(longEmail.body)).toContain("external_owner_email");
  });

  it("rejects a non-string external name", async () => {
    await supertest(app).patch("/projects/1").send({ external_owner_name: 42 }).expect(400);
  });

  it("allows null external fields, which is how they are cleared", async () => {
    await supertest(app)
      .patch("/projects/1")
      .send({ owner: 5, external_owner_name: null, external_owner_email: null })
      .expect(200);
  });
});

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
