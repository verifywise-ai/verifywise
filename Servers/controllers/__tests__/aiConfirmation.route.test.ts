import request from "supertest";
import express from "express";
import aiConfirmationRoutes from "../../routes/aiConfirmation.route";

jest.mock("../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-test-role"] || "Editor";
    // The i18nMiddleware always runs before accessControl.middleware in the
    // real stack (app.ts), so req.t is set. Simulate with an identity
    // translator so a refusal here is a clean 403, not accessControl.middleware
    // throwing on req.t being undefined.
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../aiConfirmation.ctrl", () => ({
  approveConfirmation: (_req: any, res: any) => res.status(200).json({ ok: true }),
  rejectConfirmation: (_req: any, res: any) => res.status(200).json({ ok: true }),
  getPendingConfirmations: (_req: any, res: any) => res.status(200).json({ ok: true }),
}));

const app = express();
app.use(express.json());
app.use("/api/ai-confirmations", aiConfirmationRoutes);

describe("ai-confirmations route guards", () => {
  it("refuses a non-Admin approving a confirmation", async () => {
    // Same approveAction as /api/ai-approvals/:id/approve, which is Admin-only.
    // Without this guard the Admin-only rule on workflow gates is bypassable.
    const res = await request(app)
      .post("/api/ai-confirmations/approve/appr-1")
      .set("x-test-role", "Editor");
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied");
  });

  it("refuses a non-Admin rejecting a confirmation", async () => {
    const res = await request(app)
      .post("/api/ai-confirmations/reject/appr-1")
      .set("x-test-role", "Auditor");
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied");
  });

  it("allows an Admin", async () => {
    const res = await request(app)
      .post("/api/ai-confirmations/approve/appr-1")
      .set("x-test-role", "Admin");
    expect(res.status).toBe(200);
  });

  it("leaves the read endpoint open to any authenticated role", async () => {
    const res = await request(app)
      .get("/api/ai-confirmations/pending")
      .set("x-test-role", "Auditor");
    expect(res.status).toBe(200);
  });
});
