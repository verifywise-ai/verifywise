import { vi } from "vitest";
import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";

// --- Mocks: keep AdvisorChat free of the assistant-ui runtime / network ---

vi.mock("@assistant-ui/react", () => ({
  AssistantRuntimeProvider: ({ children }: any) => (
    <div data-testid="assistant-runtime">{children}</div>
  ),
}));

vi.mock("../useAdvisorRuntime", () => ({
  useAdvisorRuntime: vi.fn().mockReturnValue({}),
}));

vi.mock("../CustomThread", () => ({
  CustomThread: () => <div data-testid="custom-thread" />,
}));

vi.mock("../AdvisorHeader", () => ({
  AdvisorHeader: () => <div data-testid="advisor-header" />,
}));

vi.mock("../advisorConfig", () => ({
  AdvisorDomain: {},
}));

vi.mock("../../../../application/contexts/AdvisorConversation.context", () => ({
  useAdvisorConversationSafe: vi.fn().mockReturnValue(null),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// The command plane hook is mocked so no plan/execute network call fires.
const plan = vi.fn().mockResolvedValue([]);
const run = vi.fn().mockResolvedValue(undefined);
const useCommandPlaneMock = vi.fn();

vi.mock("../../../../application/hooks/useCommandPlane", () => ({
  useCommandPlane: (...args: unknown[]) => useCommandPlaneMock(...args),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import AdvisorChat from "../index";
import type {
  CommandStep,
  StepStatusEvent,
} from "../../../../application/repository/commandPlane.repository";

const STEPS: CommandStep[] = [
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
    requiresApproval: true,
    inputs: { severity: "high" },
  },
];

describe("AdvisorChat command mode", () => {
  beforeEach(() => {
    plan.mockClear();
    run.mockClear();
    // Default: no planned steps yet, idle.
    useCommandPlaneMock.mockReturnValue({
      steps: [] as CommandStep[],
      statuses: {} as Record<number, StepStatusEvent>,
      plan,
      run,
      isRunning: false,
    });
  });

  it("renders a command input and a Run/plan affordance", () => {
    renderWithProviders(<AdvisorChat hasLLMKeys={true} />);

    expect(screen.getByTestId("command-input")).toBeInTheDocument();
    expect(screen.getByTestId("command-run")).toBeInTheDocument();
  });

  it("planning a command calls the command plane with the typed text", () => {
    renderWithProviders(<AdvisorChat hasLLMKeys={true} />);

    const input = screen.getByTestId("command-input").querySelector("textarea")!;
    fireEvent.change(input, { target: { value: "register a model and flag it" } });
    fireEvent.click(screen.getByTestId("command-run"));

    expect(plan).toHaveBeenCalledWith("register a model and flag it");
  });

  it("shows the StepStatusPanel once the command plane has steps", () => {
    useCommandPlaneMock.mockReturnValue({
      steps: STEPS,
      statuses: { 1: { stepOrder: 1, status: "completed", result: { id: 42 } } },
      plan,
      run,
      isRunning: false,
    });

    renderWithProviders(<AdvisorChat hasLLMKeys={true} />);

    expect(screen.getByTestId("step-status-panel")).toBeInTheDocument();
    expect(screen.getByText("Create a high-risk model entry")).toBeInTheDocument();
    expect(screen.getByTestId("step-status-1")).toHaveTextContent(/completed/i);
  });

  it("does not render the StepStatusPanel when there are no steps", () => {
    renderWithProviders(<AdvisorChat hasLLMKeys={true} />);

    expect(screen.queryByTestId("step-status-panel")).not.toBeInTheDocument();
  });
});
