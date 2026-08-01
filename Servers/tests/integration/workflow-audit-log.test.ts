/**
 * The workflow engine's audit trail must actually reach the database.
 *
 * logWorkflowAudit swallows its own errors by design (an audit failure must
 * never abort a run), so a column that does not exist produces a silently
 * empty compliance trail while every unit test still passes — the engine unit
 * tests mock sequelize.query and only assert the SQL text. This suite runs the
 * INSERT against the real schema, which is the only place the mismatch shows.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { startWorkflow } from "../../services/workflows/engine";
import { WorkflowDefinition } from "../../services/workflows/types";
import { createTestOrganization, cleanupDatabase } from "./helpers";

let ORG_ID: number;

const trivialWorkflow: WorkflowDefinition = {
  id: "audit_log_probe",
  name: "Audit log probe",
  triggerName: "audit.log.probe",
  agents: ["probe"],
  steps: [
    {
      id: "first",
      description: "no-op",
      agent: "probe",
      isWrite: false,
      handler: async () => ({ type: "ok", output: { ok: true } }),
    },
    {
      id: "second",
      description: "no-op",
      agent: "probe",
      isWrite: false,
      handler: async () => ({ type: "ok", output: { ok: true } }),
    },
  ],
};

async function auditRowsFor(workflowRunId: number) {
  return (await sequelize.query(
    `SELECT to_state, rule_name, workflow_run_id
       FROM ai_action_audit_log
      WHERE workflow_run_id = :workflowRunId
      ORDER BY id ASC`,
    { replacements: { workflowRunId }, type: QueryTypes.SELECT },
  )) as Array<{ to_state: string; rule_name: string; workflow_run_id: number }>;
}

describe("workflow engine audit trail", () => {
  beforeEach(async () => {
    await cleanupDatabase();
    ORG_ID = await createTestOrganization("Audit probe org");
  });

  afterAll(async () => {
    await cleanupDatabase();
    await sequelize.close();
  });

  it("writes one ai_action_audit_log row per transition, correlated to the run", async () => {
    const run = await startWorkflow(trivialWorkflow, {
      organizationId: ORG_ID,
      triggerPayload: { probe: true },
    });

    expect(run.state).toBe("completed");

    const rows = await auditRowsFor(run.id);

    // created + started + (running/completed per step) + completed. The exact
    // count is an engine detail; what matters is that the trail is not empty
    // and that every row is correlated to this run.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Number(r.workflow_run_id) === run.id)).toBe(true);

    const states = rows.map((r) => r.to_state);
    expect(states).toContain("pending");
    expect(states).toContain("running");
    expect(states).toContain("completed");

    const ruleNames = rows.map((r) => r.rule_name);
    expect(ruleNames).toContain("workflow.audit_log_probe.created");
  });

  it("persists run state through a real UPDATE (awaiting_approval_id is uuid, the bind is text)", async () => {
    // persistRun sets awaiting_approval_id via a CASE. Postgres types the whole
    // CASE from the bound parameter, so an uncast text bind is rejected on
    // EVERY transition — including the ELSE NULL branch taken by workflows that
    // never pause. That left runs stuck in 'pending' with no error surfaced,
    // and the engine unit tests could not see it because they mock
    // sequelize.query and only assert the SQL text.
    const run = await startWorkflow(trivialWorkflow, {
      organizationId: ORG_ID,
      triggerPayload: {},
    });

    const rows = (await sequelize.query(
      `SELECT state, current_step, awaiting_approval_id, completed_at
         FROM ai_workflow_runs
        WHERE id = :id AND organization_id = :organizationId`,
      { replacements: { id: run.id, organizationId: ORG_ID }, type: QueryTypes.SELECT },
    )) as Array<{
      state: string;
      current_step: number;
      awaiting_approval_id: string | null;
      completed_at: Date | null;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("completed");
    expect(rows[0].awaiting_approval_id).toBeNull();
    expect(rows[0].completed_at).not.toBeNull();
  });

  it("keeps the audit trail scoped to the run's organization", async () => {
    const run = await startWorkflow(trivialWorkflow, {
      organizationId: ORG_ID,
      triggerPayload: {},
    });

    const rows = (await sequelize.query(
      `SELECT DISTINCT organization_id
         FROM ai_action_audit_log
        WHERE workflow_run_id = :workflowRunId`,
      { replacements: { workflowRunId: run.id }, type: QueryTypes.SELECT },
    )) as Array<{ organization_id: number }>;

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].organization_id)).toBe(ORG_ID);
  });
});
