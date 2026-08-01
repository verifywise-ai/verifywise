jest.setTimeout(60000);

/**
 * The workflow approval gate, end to end against the real schema.
 *
 * Before this work no definition produced an approvalId, so the engine
 * persisted awaiting_approval_id = NULL and the only resume path — which
 * matches on that column — never fired. audit_preparation, vendor_onboarding
 * and incident_response parked in awaiting_approval permanently. Deeper still:
 * submitForApproval auto-rejects anything whose tool has no executor, and
 * approveActionImpl bailed on "No executor" before reaching the resume, so even
 * a hand-inserted approval could not be approved.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { startWorkflow, resumeWorkflow } from "../../services/workflows/engine";
import { register } from "../../services/workflows/registry";
import { requestGateApproval } from "../../services/workflows/approvalGate";
import { approveAction, rejectAction } from "../../advisor/approval/approvalGateway";
import { WorkflowDefinition } from "../../services/workflows/types";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

const twoGateWorkflow: WorkflowDefinition = {
  id: "gate_probe",
  name: "Gate probe",
  triggerName: "gate.probe",
  agents: ["probe"],
  steps: [
    {
      id: "first_gate",
      description: "gated write",
      agent: "probe",
      isWrite: true,
      handler: async (ctx) =>
        ctx.resumedApprovalId
          ? { type: "ok", output: { first: true } }
          : requestGateApproval(ctx, "gate_probe", "first_gate", "Approve the first write"),
    },
    {
      id: "second_gate",
      description: "gated write",
      agent: "probe",
      isWrite: true,
      handler: async (ctx) =>
        ctx.resumedApprovalId
          ? { type: "ok", output: { second: true } }
          : requestGateApproval(ctx, "gate_probe", "second_gate", "Approve the second write"),
    },
  ],
};

async function runRow(id: number) {
  const rows = (await sequelize.query(
    `SELECT state, awaiting_approval_id FROM ai_workflow_runs WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  )) as Array<{ state: string; awaiting_approval_id: string | null }>;
  return rows[0];
}

async function approvalRow(id: string) {
  const rows = (await sequelize.query(
    `SELECT state, tool_name FROM ai_action_approvals WHERE id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT },
  )) as Array<{ state: string; tool_name: string }>;
  return rows[0];
}

describe("workflow approval gate end to end", () => {
  let orgId: number;
  let adminId: number;

  beforeAll(() => register(twoGateWorkflow));

  // approveAction/rejectAction fire a state-history audit write
  // (logStateHistory(...).catch(() => {})) without awaiting it. The write
  // outlives the call that triggered it, so the next test's cleanupDatabase()
  // TRUNCATE can race a still-in-flight INSERT that references the org this
  // test is about to delete — surfacing as a non-fatal but noisy "deadlock
  // detected" / FK-violation log line from aiAuditTrail.service. Draining here
  // is a test-side mitigation for a real gap in the production code (the
  // promise should be awaited or otherwise tracked); it is not masking this
  // suite's own assertions, only giving stray background writes from the
  // PREVIOUS test time to land before the next TRUNCATE.
  beforeEach(async () => {
    await new Promise((r) => setTimeout(r, 100));
    await cleanupDatabase();
    orgId = await createTestOrganization("Gate org");
    adminId = await createTestUser(orgId, 1, `gate-admin-${Date.now()}@test.com`, "Password123!");
  });

  afterAll(async () => {
    // Same race as above, but against sequelize.close(): a still-in-flight
    // fire-and-forget audit write can throw once the pool is closed under it,
    // which Jest reports as a bare "Test suite failed to run" with no message
    // (confirmed by reproducing it with this drain removed). Draining first
    // lets those writes finish before the pool goes away.
    await new Promise((r) => setTimeout(r, 500));
    await cleanupDatabase();
    await sequelize.close();
  });

  it("pauses with a real approval id persisted to the run", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });

    expect(run.state).toBe("awaiting_approval");
    const row = await runRow(run.id);
    expect(row.awaiting_approval_id).toBeTruthy();

    const approval = await approvalRow(row.awaiting_approval_id!);
    expect(approval.state).toBe("pending_approval");
    expect(approval.tool_name).toBe("workflow_gate");
  });

  it("approving resumes the run, and the SECOND gate pauses for its own approval", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;

    const result = await approveAction(orgId, first, adminId);
    expect(result.success).toBe(true);

    const after = await runRow(run.id);
    // One human decision must not authorize two gated writes.
    expect(after.state).toBe("awaiting_approval");
    expect(after.awaiting_approval_id).toBeTruthy();
    expect(after.awaiting_approval_id).not.toBe(first);

    // Resuming into a brand-new gate is success, not "resume did not advance
    // the run" — the first approval must not be left/marked failed by a
    // resume that actually worked.
    expect((await approvalRow(first)).state).not.toBe("failed");
  });

  it("approving both gates drives the run to completed", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, first, adminId);
    const second = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, second, adminId);

    expect((await runRow(run.id)).state).toBe("completed");
  });

  it("rejecting cancels the run and clears the approval link", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;

    const result = await rejectAction(orgId, first, adminId, "not now");
    expect(result.success).toBe(true);

    const after = await runRow(run.id);
    expect(after.state).toBe("cancelled");
    expect(after.awaiting_approval_id).toBeNull();
    expect((await approvalRow(first)).state).toBe("rejected");
  });

  it("writes the audit trail for the whole cycle", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await rejectAction(orgId, first, adminId, "no");

    const rows = (await sequelize.query(
      `SELECT to_state, rule_name FROM ai_action_audit_log
        WHERE workflow_run_id = :id ORDER BY id ASC`,
      { replacements: { id: run.id }, type: QueryTypes.SELECT },
    )) as Array<{ to_state: string; rule_name: string }>;

    expect(rows.map((r) => r.to_state)).toContain("awaiting_approval");
    expect(rows.map((r) => r.to_state)).toContain("cancelled");
    expect(rows.map((r) => r.rule_name)).toContain("workflow.gate_probe.rejected");
  });

  it("marks a gate failed when its run has vanished, rather than reporting success", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await sequelize.query(`DELETE FROM ai_workflow_runs WHERE id = :id`, {
      replacements: { id: run.id },
      type: QueryTypes.DELETE,
    });

    const result = await approveAction(orgId, first, adminId);
    expect(result.success).toBe(false);
  });

  it("resume is a no-op for a run that is not awaiting approval", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, first, adminId);
    const second = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, second, adminId);

    const again = await resumeWorkflow(run.id, second, orgId);
    expect(again?.state).toBe("completed");
  });
});
