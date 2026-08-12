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
import * as aiAuditTrail from "../../services/aiAuditTrail.service";

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

async function auditLogCount(workflowRunId: number): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM ai_action_audit_log WHERE workflow_run_id = :workflowRunId`,
    { replacements: { workflowRunId }, type: QueryTypes.SELECT },
  )) as Array<{ c: number }>;
  return rows[0].c;
}

// approveAction/rejectAction/submitWorkflowGate fire a state-history audit
// write (logStateHistory(...).catch(() => {})) without awaiting it. Left
// alone, that write can outlive the call that triggered it and:
//   - race the NEXT test's cleanupDatabase() TRUNCATE (a still-in-flight
//     INSERT referencing an org that is about to be deleted), surfacing as a
//     non-fatal but noisy "deadlock detected" / FK-violation log line from
//     aiAuditTrail.service; or
//   - race afterAll's sequelize.close(): a query that is still in flight when
//     the pool closes under it can throw somewhere logTransition's own
//     try/catch doesn't reach, which Jest reports as a bare "Test suite
//     failed to run" with no message — destroying every test's signal in the
//     file, not just one assertion. Reproduced directly: with no drain at all
//     before sequelize.close(), this crash fires reliably; a fixed 500ms
//     sleep in its place made it go away in this environment, but "long
//     enough on this machine" is not a bound anyone can rely on in CI.
//
// Rather than bet on a fixed sleep being long enough under CI load (this
// suite runs eighth in a shared --runInBand pass), spy on logStateHistory —
// the single choke point every one of those fire-and-forget calls goes
// through — and explicitly await every promise it hands back before the next
// destructive operation. This works because aiAuditTrail.service.ts and this
// test file both go through TypeScript's commonjs + esModuleInterop output:
// `import * as aiAuditTrail from "./aiAuditTrail.service"` resolves to the
// SAME exports object approvalGateway.ts's compiled `logStateHistory(...)`
// calls do a property lookup on, so replacing the property here is visible
// there too (verified: pendingAuditWrites is non-empty after every
// approveAction/rejectAction call in this file, and the drain removes the
// crash without weakening or skipping any assertion).
let pendingAuditWrites: Promise<unknown>[] = [];

async function drainAuditWrites(): Promise<void> {
  const toDrain = pendingAuditWrites;
  pendingAuditWrites = [];
  await Promise.allSettled(toDrain);
}

describe("workflow approval gate end to end", () => {
  let orgId: number;
  let adminId: number;

  beforeAll(() => {
    register(twoGateWorkflow);
    const original = aiAuditTrail.logStateHistory;
    jest.spyOn(aiAuditTrail, "logStateHistory").mockImplementation((...args) => {
      const p = original(...args);
      pendingAuditWrites.push(p);
      return p;
    });
  });

  beforeEach(async () => {
    // Drain the PREVIOUS test's stray writes before truncating out from
    // under them.
    await drainAuditWrites();
    await cleanupDatabase();
    orgId = await createTestOrganization("Gate org");
    adminId = await createTestUser(orgId, 1, `gate-admin-${Date.now()}@test.com`, "Password123!");
  });

  afterAll(async () => {
    // Drain this file's last test before closing the pool out from under it.
    await drainAuditWrites();
    jest.restoreAllMocks();
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
    // The test's own name is a claim about persisted state, not just the
    // return value: the gate must actually be written back as failed.
    expect((await approvalRow(first)).state).toBe("failed");
  });

  it("resume is a no-op for a run that is not awaiting approval", async () => {
    const run = await startWorkflow(twoGateWorkflow, { organizationId: orgId, userId: adminId });
    const first = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, first, adminId);
    const second = (await runRow(run.id)).awaiting_approval_id!;
    await approveAction(orgId, second, adminId);

    // The run is already 'completed' before this call, so it would read
    // back as 'completed' whether resumeWorkflow genuinely declined to act
    // OR silently re-ran the step loop and coincidentally landed on the same
    // terminal state. Counting audit rows before/after is what tells those
    // apart: a real no-op writes nothing further to the trail.
    const auditCountBefore = await auditLogCount(run.id);
    const again = await resumeWorkflow(run.id, second, orgId);
    expect(again?.state).toBe("completed");
    expect(await auditLogCount(run.id)).toBe(auditCountBefore);
  });
});
