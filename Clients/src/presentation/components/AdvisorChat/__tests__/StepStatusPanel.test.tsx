import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import StepStatusPanel from "../StepStatusPanel";
import type {
  CommandStep,
  StepStatusEvent,
} from "../../../../application/repository/commandPlane.repository";

const steps: CommandStep[] = [
  {
    order: 1,
    description: "Create a high-risk model entry",
    intent: "register_model",
    agent: "model-inventory",
    toolName: "agent_register_model",
    requiresApproval: false,
    inputs: { name: "Fraud Detector" },
  },
  {
    order: 2,
    description: "Flag the model for review",
    intent: "create_model_risk",
    agent: "model-risk",
    toolName: "agent_create_model_risk",
    requiresApproval: true,
    inputs: { severity: "high" },
  },
  {
    order: 3,
    description: "Notify the compliance owner",
    intent: "notify_user",
    agent: "notifications",
    requiresApproval: false,
    inputs: { userId: 7 },
  },
];

describe("StepStatusPanel", () => {
  it("renders every step's description", () => {
    renderWithProviders(<StepStatusPanel steps={steps} statuses={{}} />);

    expect(screen.getByText("Create a high-risk model entry")).toBeInTheDocument();
    expect(screen.getByText("Flag the model for review")).toBeInTheDocument();
    expect(screen.getByText("Notify the compliance owner")).toBeInTheDocument();
  });

  it("renders a status chip per step reflecting the mixed statuses", () => {
    const statuses: Record<number, StepStatusEvent> = {
      1: { stepOrder: 1, status: "completed", result: { id: 42 } },
      2: { stepOrder: 2, status: "awaiting_approval", approvalId: "appr-1" },
      3: { stepOrder: 3, status: "executing" },
    };

    renderWithProviders(<StepStatusPanel steps={steps} statuses={statuses} />);

    expect(screen.getByTestId("step-status-1")).toHaveTextContent(/completed/i);
    expect(screen.getByTestId("step-status-2")).toHaveTextContent(/awaiting/i);
    expect(screen.getByTestId("step-status-3")).toHaveTextContent(/executing/i);
  });

  it("defaults to pending when a step has no status event yet", () => {
    renderWithProviders(<StepStatusPanel steps={steps} statuses={{}} />);

    expect(screen.getByTestId("step-status-1")).toHaveTextContent(/pending/i);
  });

  it("shows the approve/reject affordance only when a step is awaiting approval", () => {
    const statuses: Record<number, StepStatusEvent> = {
      2: { stepOrder: 2, status: "awaiting_approval", approvalId: "appr-1" },
    };

    renderWithProviders(<StepStatusPanel steps={steps} statuses={statuses} />);

    // Step 2 is awaiting approval -> affordance present.
    expect(screen.getByTestId("step-approval-2")).toBeInTheDocument();
    // Steps 1 and 3 are not awaiting approval -> no affordance.
    expect(screen.queryByTestId("step-approval-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("step-approval-3")).not.toBeInTheDocument();
  });

  it("renders the result for a completed step and the error for a failed step", () => {
    const statuses: Record<number, StepStatusEvent> = {
      1: { stepOrder: 1, status: "completed", result: { id: 42 } },
      2: { stepOrder: 2, status: "failed", error: "Tool execution failed" },
    };

    renderWithProviders(<StepStatusPanel steps={steps} statuses={statuses} />);

    expect(screen.getByTestId("step-result-1")).toHaveTextContent(/42/);
    expect(screen.getByTestId("step-error-2")).toHaveTextContent("Tool execution failed");
  });
});
