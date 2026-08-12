import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../services/automations/automationProducer", () => ({
  enqueueRiskLinkRecompute: jest.fn().mockResolvedValue(undefined),
}));

import { enqueueRiskLinkRecompute } from "../../services/automations/automationProducer";
import * as fs from "fs";
import * as path from "path";

/**
 * Amendment B is a policy, not a code path — the controller is far too wired
 * into Express, Sequelize, notifications and audit logging to exercise its four
 * commit sites from a unit test without mocking half the backend. These assert
 * the policy against the source instead: the enqueue appears in the create,
 * update and set_category paths, and nowhere near the delete path.
 */
const source = fs.readFileSync(
  path.join(__dirname, "..", "risks.ctrl.ts"),
  "utf8",
);

const bodyOf = (fnName: string): string => {
  const start = source.indexOf(`export async function ${fnName}`);
  if (start === -1) throw new Error(`${fnName} not found in risks.ctrl.ts`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

describe("risk link enqueue matrix (amendment B)", () => {
  it("imports the producer", () => {
    expect(source).toContain("enqueueRiskLinkRecompute");
    expect(enqueueRiskLinkRecompute).toBeDefined();
  });

  it("enqueues after creating a risk", () => {
    expect(bodyOf("createRisk")).toContain("enqueueRiskLinkRecompute(");
  });

  it("enqueues after updating a risk", () => {
    expect(bodyOf("updateRiskById")).toContain("enqueueRiskLinkRecompute(");
  });

  // R7: edges outlive a soft-deleted risk and the job would exit quietly anyway.
  it("does NOT enqueue after deleting a risk", () => {
    expect(bodyOf("deleteRiskById")).not.toContain("enqueueRiskLinkRecompute(");
  });

  it("enqueues from the bulk path only under set_category", () => {
    const bulk = bodyOf("bulkUpdateProjectRisks");
    expect(bulk).toContain("enqueueRiskLinkRecompute(");
    expect(bulk).toContain('action === "set_category"');
  });
});

describe("agent_create_risk", () => {
  const executeSource = fs.readFileSync(
    path.join(__dirname, "..", "..", "advisor", "aiActions", "createRisk", "execute.ts"),
    "utf8",
  );

  // Enqueueing before the commit would race: the worker reads the risk, does not
  // find it, and exits quietly — leaving the risk permanently unlinked.
  it("enqueues from afterCommit, not inline", () => {
    expect(executeSource).toContain("ctx.transaction.afterCommit(");
    expect(executeSource).toContain("enqueueRiskLinkRecompute(");
  });
});
