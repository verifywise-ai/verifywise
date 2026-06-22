/**
 * Phase 2 — XState v5 Approval State Machine
 *
 * Deterministic state machine governing every AI write operation lifecycle.
 * Pure state logic — no async side effects. The gateway orchestrates execution.
 */

import { setup, assign } from "xstate";
import type { ApprovalContext, ApprovalEvent, StateHistoryEntry } from "./types";

/**
 * Append a transition entry to the state history.
 */
function appendHistory(
  history: StateHistoryEntry[],
  state: string,
  actor?: string,
  reason?: string,
): StateHistoryEntry[] {
  return [
    ...history,
    {
      state,
      timestamp: new Date().toISOString(),
      ...(actor && { actor }),
      ...(reason && { reason }),
    },
  ];
}

export const approvalMachine = setup({
  types: {
    context: {} as ApprovalContext,
    events: {} as ApprovalEvent,
  },
  guards: {
    isAutoApprovable: ({ context }) => context.riskLevel === "info",
    isAutoRejectable: ({ context }) => {
      // Import dynamically avoided — guard is set by gateway at creation time
      // The gateway sets context.ruleMatched = "no_executor" before sending SUBMIT
      return context.ruleMatched === "no_executor";
    },
    requiresApproval: ({ context }) =>
      context.riskLevel !== "info" && context.ruleMatched !== "no_executor",
  },
  actions: {
    logEvaluate: assign({
      stateHistory: ({ context }) =>
        appendHistory(context.stateHistory, "evaluate", "system", "evaluating rules"),
      evaluatedAt: () => new Date().toISOString(),
    }),
    logAutoApprove: assign({
      stateHistory: ({ context }) =>
        appendHistory(
          context.stateHistory,
          "auto_approve",
          "system",
          `rule: risk_level=${context.riskLevel}`,
        ),
      ruleMatched: ({ context }) =>
        context.ruleMatched || `auto_approve:risk_level=${context.riskLevel}`,
    }),
    logAutoReject: assign({
      stateHistory: ({ context }) =>
        appendHistory(
          context.stateHistory,
          "auto_reject",
          "system",
          context.ruleMatched || "no_executor",
        ),
      errorMessage: ({ context }) => context.ruleMatched || "Auto-rejected: no executor registered",
    }),
    logPendingApproval: assign({
      stateHistory: ({ context }) =>
        appendHistory(
          context.stateHistory,
          "pending_approval",
          "system",
          "awaiting human approval",
        ),
    }),
    logApproved: assign({
      stateHistory: ({ context, event }) =>
        appendHistory(
          context.stateHistory,
          "approved",
          `user:${(event as { type: "APPROVE"; userId: number }).userId}`,
          "human approved",
        ),
      approvedAt: () => new Date().toISOString(),
    }),
    logRejected: assign({
      stateHistory: ({ context, event }) =>
        appendHistory(
          context.stateHistory,
          "rejected",
          `user:${(event as { type: "REJECT"; userId: number }).userId}`,
          (event as { type: "REJECT"; reason?: string }).reason || "human rejected",
        ),
    }),
    logExecuting: assign({
      stateHistory: ({ context }) =>
        appendHistory(context.stateHistory, "executing", "system", "executing write operation"),
    }),
    logCompleted: assign({
      stateHistory: ({ context }) =>
        appendHistory(context.stateHistory, "completed", "system", "execution succeeded"),
      result: ({ event }) => (event as { type: "EXECUTE_SUCCESS"; result: unknown }).result,
      executedAt: () => new Date().toISOString(),
    }),
    logFailed: assign({
      stateHistory: ({ context }) =>
        appendHistory(context.stateHistory, "failed", "system", "execution failed"),
      errorMessage: ({ event }) => (event as { type: "EXECUTE_FAILURE"; error: string }).error,
      executedAt: () => new Date().toISOString(),
    }),
  },
}).createMachine({
  id: "approval",
  initial: "idle",
  context: ({}) => ({
    id: "",
    organizationId: 0,
    userId: 0,
    actionType: "",
    toolName: "",
    inputParams: {},
    riskLevel: "warning" as const,
    description: "",
    stateHistory: [],
    createdAt: new Date().toISOString(),
  }),
  states: {
    idle: {
      on: {
        SUBMIT: {
          target: "evaluate",
        },
      },
    },

    evaluate: {
      entry: "logEvaluate",
      always: [
        {
          guard: "isAutoRejectable",
          target: "auto_reject",
        },
        {
          guard: "isAutoApprovable",
          target: "auto_approve",
        },
        {
          guard: "requiresApproval",
          target: "pending_approval",
        },
      ],
    },

    auto_approve: {
      entry: "logAutoApprove",
      always: {
        target: "executing",
      },
    },

    auto_reject: {
      entry: "logAutoReject",
      type: "final",
    },

    pending_approval: {
      entry: "logPendingApproval",
      on: {
        APPROVE: {
          target: "approved",
        },
        REJECT: {
          target: "rejected",
        },
      },
    },

    approved: {
      entry: "logApproved",
      always: {
        target: "executing",
      },
    },

    rejected: {
      entry: "logRejected",
      type: "final",
    },

    executing: {
      entry: "logExecuting",
      on: {
        EXECUTE_SUCCESS: {
          target: "completed",
        },
        EXECUTE_FAILURE: {
          target: "failed",
        },
      },
    },

    completed: {
      entry: "logCompleted",
      type: "final",
    },

    failed: {
      entry: "logFailed",
      type: "final",
    },
  },
});

export type ApprovalMachine = typeof approvalMachine;
