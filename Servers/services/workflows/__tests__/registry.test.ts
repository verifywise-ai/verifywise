/**
 * Phase 6 — Workflow registry tests (issue 3813).
 *
 * register(def) then getWorkflow(key) returns it; listWorkflows() includes it.
 */

import { describe, expect, it } from "@jest/globals";

import { register, getWorkflow, listWorkflows } from "../registry";
import type { WorkflowDefinition } from "../types";

function makeDef(id: string): WorkflowDefinition {
  return {
    id,
    name: `Workflow ${id}`,
    triggerName: `${id}.trigger`,
    agents: ["compliance"],
    steps: [
      {
        id: "noop",
        description: "no-op",
        agent: "compliance",
        isWrite: false,
        handler: async () => ({ type: "ok", output: {} }),
      },
    ],
  };
}

describe("workflows / registry", () => {
  it("getWorkflow(key) returns a registered definition", () => {
    const def = makeDef("reg_test_alpha");
    register(def);

    expect(getWorkflow("reg_test_alpha")).toBe(def);
  });

  it("listWorkflows() includes a registered definition", () => {
    const def = makeDef("reg_test_beta");
    register(def);

    expect(listWorkflows()).toContainEqual(def);
  });

  it("getWorkflow returns undefined for an unknown key", () => {
    expect(getWorkflow("does_not_exist_xyz")).toBeUndefined();
  });
});
