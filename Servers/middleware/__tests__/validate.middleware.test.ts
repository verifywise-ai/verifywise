import { describe, it, expect, jest } from "@jest/globals";
import express from "express";
import supertest from "supertest";
import { body } from "express-validator";

import { handleValidationErrors, validate } from "../validate.middleware";

import {
  validateCreateApprovalRequest,
  validateApprovalActionBody,
  validateApprovalIdParam,
} from "../validators/approvalRequest.validator";
import {
  validateCreateAutomation,
  validateUpdateAutomation,
  validateAutomationIdParam,
} from "../validators/automations.validator";
import {
  validateUpdateFileMetadata,
  validateFileSearchQuery,
} from "../validators/fileManager.validator";
import {
  validateCreateAITrustResource,
  validateCreateAITrustSubprocessor,
  validateUpdateAITrustSubprocessor,
} from "../validators/aiTrustCentre.validator";
import {
  validateRunAdvisor,
  validateStreamAdvisorV2,
  validateConversationParams,
} from "../validators/advisor.validator";
import {
  validateUpdateToolStatus,
  validateStartGovernance,
  validateCreateRule,
  validateCreateSyslogConfig,
} from "../validators/shadowAi.validator";

// The shared error envelope from STATUS_CODE[400] is always:
//   { message: "Bad Request", data: { errors: [{ field, message, location }, ...] } }
function assertConsistentValidationErrorShape(body: any) {
  expect(body).toEqual(
    expect.objectContaining({
      message: "Bad Request",
      data: expect.objectContaining({
        errors: expect.any(Array),
      }),
    }),
  );
  expect(body.data.errors.length).toBeGreaterThan(0);
  for (const err of body.data.errors) {
    expect(err).toEqual(
      expect.objectContaining({
        field: expect.any(String),
        message: expect.any(String),
        location: expect.any(String),
      }),
    );
  }
}

const noopHandler = jest.fn((_req: express.Request, res: express.Response) =>
  res.status(200).json({ ok: true }),
);

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());

  // approvalRequest
  app.post("/approval-requests", validateCreateApprovalRequest, noopHandler);
  app.post("/approval-requests/:id/approve", validateApprovalActionBody, noopHandler);
  app.post("/approval-requests/:id/withdraw", validateApprovalIdParam, noopHandler);

  // automations
  app.post("/automations", validateCreateAutomation, noopHandler);
  app.put("/automations/:id", validateUpdateAutomation, noopHandler);
  app.delete("/automations/:id", validateAutomationIdParam, noopHandler);

  // fileManager
  app.patch("/file-manager/:id/metadata", validateUpdateFileMetadata, noopHandler);
  app.get("/file-manager/search", validateFileSearchQuery, noopHandler);

  // aiTrustCentre
  app.post("/ai-trust-centre/resources", validateCreateAITrustResource, noopHandler);
  app.post("/ai-trust-centre/subprocessors", validateCreateAITrustSubprocessor, noopHandler);
  app.put("/ai-trust-centre/subprocessors/:id", validateUpdateAITrustSubprocessor, noopHandler);

  // advisor
  app.post("/advisor", validateRunAdvisor, noopHandler);
  app.post("/advisor/chat", validateStreamAdvisorV2, noopHandler);
  app.delete("/advisor/conversations/:domain/:id", validateConversationParams, noopHandler);

  // shadowAi
  app.patch("/shadow-ai/tools/:id/status", validateUpdateToolStatus, noopHandler);
  app.post("/shadow-ai/tools/:id/start-governance", validateStartGovernance, noopHandler);
  app.post("/shadow-ai/rules", validateCreateRule, noopHandler);
  app.post("/shadow-ai/config/syslog", validateCreateSyslogConfig, noopHandler);

  return app;
}

describe("handleValidationErrors (shared middleware)", () => {
  it("returns STATUS_CODE[400] envelope with structured errors", async () => {
    const app = express();
    app.use(express.json());
    app.post("/x", validate(body("name").isString().notEmpty()), (_req, res) =>
      res.status(200).json({ ok: true }),
    );

    const res = await supertest(app).post("/x").send({}).expect(400);

    assertConsistentValidationErrorShape(res.body);
    const fields = res.body.data.errors.map((e: any) => e.field);
    expect(fields).toContain("name");
  });

  it("passes through when validation succeeds", async () => {
    const app = express();
    app.use(express.json());
    app.post("/x", validate(body("name").isString().notEmpty()), (_req, res) =>
      res.status(200).json({ ok: true }),
    );

    const res = await supertest(app).post("/x").send({ name: "foo" }).expect(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("controllers reject malformed payloads with 400 + consistent shape", () => {
  const app = makeApp();

  beforeEach(() => noopHandler.mockClear());

  describe("approvalRequest", () => {
    it("POST / — missing request_name and workflow_id", async () => {
      const res = await supertest(app).post("/approval-requests").send({}).expect(400);
      assertConsistentValidationErrorShape(res.body);
      expect(noopHandler).not.toHaveBeenCalled();
    });

    it("POST /:id/approve — non-numeric id", async () => {
      const res = await supertest(app).post("/approval-requests/abc/approve").send({}).expect(400);
      assertConsistentValidationErrorShape(res.body);
      const fields = res.body.data.errors.map((e: any) => e.field);
      expect(fields).toContain("id");
    });

    it("POST /:id/withdraw — non-numeric id", async () => {
      const res = await supertest(app).post("/approval-requests/xyz/withdraw").send({}).expect(400);
      assertConsistentValidationErrorShape(res.body);
    });
  });

  describe("automations", () => {
    it("POST / — missing triggerId/name/actions", async () => {
      const res = await supertest(app).post("/automations").send({}).expect(400);
      assertConsistentValidationErrorShape(res.body);
      const fields = res.body.data.errors.map((e: any) => e.field);
      expect(fields).toEqual(expect.arrayContaining(["triggerId", "name", "actions"]));
    });

    it("POST / — actions empty array", async () => {
      const res = await supertest(app)
        .post("/automations")
        .send({ triggerId: 1, name: "x", actions: [] })
        .expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("DELETE /:id — invalid id", async () => {
      const res = await supertest(app).delete("/automations/not-a-number").expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("PUT /:id — invalid is_active type", async () => {
      const res = await supertest(app)
        .put("/automations/1")
        .send({ is_active: "yes-please" })
        .expect(400);
      assertConsistentValidationErrorShape(res.body);
    });
  });

  describe("fileManager", () => {
    it("PATCH /:id/metadata — bad review_status enum", async () => {
      const res = await supertest(app)
        .patch("/file-manager/5/metadata")
        .send({ review_status: "totally-not-a-real-status" })
        .expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("PATCH /:id/metadata — bad version format", async () => {
      const res = await supertest(app)
        .patch("/file-manager/5/metadata")
        .send({ version: "not-semver" })
        .expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("GET /search — missing q", async () => {
      const res = await supertest(app).get("/file-manager/search").expect(400);
      assertConsistentValidationErrorShape(res.body);
    });
  });

  describe("aiTrustCentre", () => {
    it("POST /resources — missing name", async () => {
      const res = await supertest(app).post("/ai-trust-centre/resources").send({}).expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("POST /subprocessors — missing name", async () => {
      const res = await supertest(app).post("/ai-trust-centre/subprocessors").send({}).expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("PUT /subprocessors/:id — invalid url", async () => {
      const res = await supertest(app)
        .put("/ai-trust-centre/subprocessors/1")
        .send({ url: "not a url" })
        .expect(400);
      assertConsistentValidationErrorShape(res.body);
    });
  });

  describe("advisor", () => {
    it("POST / — missing prompt", async () => {
      const res = await supertest(app).post("/advisor").send({}).expect(400);
      assertConsistentValidationErrorShape(res.body);
      const fields = res.body.data.errors.map((e: any) => e.field);
      expect(fields).toContain("prompt");
    });

    it("POST /chat — messages not an array", async () => {
      const res = await supertest(app).post("/advisor/chat").send({ messages: "hi" }).expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("DELETE /conversations/:domain/:id — invalid id", async () => {
      const res = await supertest(app).delete("/advisor/conversations/finance/not-int").expect(400);
      assertConsistentValidationErrorShape(res.body);
    });
  });

  describe("shadowAi", () => {
    it("PATCH /tools/:id/status — invalid status enum", async () => {
      const res = await supertest(app)
        .patch("/shadow-ai/tools/1/status")
        .send({ status: "garbage" })
        .expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("POST /tools/:id/start-governance — missing model_inventory + owner", async () => {
      const res = await supertest(app)
        .post("/shadow-ai/tools/1/start-governance")
        .send({})
        .expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("POST /rules — missing name/trigger_type/actions", async () => {
      const res = await supertest(app).post("/shadow-ai/rules").send({}).expect(400);
      assertConsistentValidationErrorShape(res.body);
    });

    it("POST /config/syslog — bad parser_type", async () => {
      const res = await supertest(app)
        .post("/shadow-ai/config/syslog")
        .send({ source_identifier: "x", parser_type: "splunk" })
        .expect(400);
      assertConsistentValidationErrorShape(res.body);
    });
  });
});
