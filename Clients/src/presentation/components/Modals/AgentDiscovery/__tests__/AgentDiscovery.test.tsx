import { vi } from "vitest";
import { screen } from "@testing-library/react";

// Mock shared dependencies
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => (
    <input data-testid={`field-${props.id || "field"}`} placeholder={props.placeholder} />
  ),
}));
vi.mock("../../../Inputs/Select", () => ({
  default: (props: any) => <div data-testid={`select-${props.id || "select"}`} />,
}));
vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children, ...props }: any) => (
    <button data-testid="customizable-button" disabled={props.isDisabled}>
      {props.text || children}
    </button>
  ),
}));
vi.mock("../../../Chip", () => ({
  default: ({ label }: any) => <span data-testid="vw-chip">{label}</span>,
}));
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validateAll: vi.fn().mockReturnValue(true),
    clearFieldError: vi.fn(),
    resetErrors: vi.fn(),
  }),
}));
vi.mock("../../../../../application/validations/stringValidation", () => ({
  checkStringValidation: () => ({ accepted: true, message: "" }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import LinkModelModal from "../LinkModelModal";
import ManualAgentModal from "../ManualAgentModal";
import ReviewAgentModal from "../ReviewAgentModal";

const mockAgent = {
  id: 1,
  source_system: "manual",
  primitive_type: "agent",
  external_id: "ext-1",
  display_name: "Test Agent",
  owner_id: "1",
  permissions: [],
  permission_categories: ["read"],
  last_activity: "2026-01-01T00:00:00Z",
  metadata: { notes: "test" },
  review_status: "pending",
  reviewed_by: null,
  reviewed_at: null,
  linked_model_inventory_id: null,
  is_stale: false,
  is_manual: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("LinkModelModal", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <LinkModelModal isOpen={true} setIsOpen={vi.fn()} agentId={1} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Link to model")).toBeInTheDocument();
  });

  it("renders select for model", () => {
    renderWithProviders(
      <LinkModelModal isOpen={true} setIsOpen={vi.fn()} agentId={1} onSuccess={vi.fn()} />,
    );
    expect(screen.getByTestId("select-model-select")).toBeInTheDocument();
  });

  it("renders cancel and link buttons", () => {
    renderWithProviders(
      <LinkModelModal isOpen={true} setIsOpen={vi.fn()} agentId={1} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Link model")).toBeInTheDocument();
  });
});

describe("ManualAgentModal", () => {
  it("renders without crashing when open (add mode)", () => {
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText("Add agent manually")).toBeInTheDocument();
  });

  it("renders form fields", () => {
    renderWithProviders(<ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByTestId("field-display_name")).toBeInTheDocument();
    expect(screen.getByTestId("select-primitive_type")).toBeInTheDocument();
    expect(screen.getByTestId("select-owner_id")).toBeInTheDocument();
    expect(screen.getByTestId("field-notes")).toBeInTheDocument();
  });

  it("renders in edit mode when agent prop is provided", () => {
    renderWithProviders(
      <ManualAgentModal isOpen={true} setIsOpen={vi.fn()} onSuccess={vi.fn()} agent={mockAgent} />,
    );
    expect(screen.getByText("Edit agent")).toBeInTheDocument();
  });
});

describe("ReviewAgentModal", () => {
  it("renders without crashing when open with agent", () => {
    renderWithProviders(
      <ReviewAgentModal isOpen={true} setIsOpen={vi.fn()} agent={mockAgent} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Agent details")).toBeInTheDocument();
  });

  it("renders agent details", () => {
    renderWithProviders(
      <ReviewAgentModal isOpen={true} setIsOpen={vi.fn()} agent={mockAgent} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Test Agent")).toBeInTheDocument();
  });

  it("renders confirm and reject buttons for pending agent", () => {
    renderWithProviders(
      <ReviewAgentModal isOpen={true} setIsOpen={vi.fn()} agent={mockAgent} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("returns null when agent is null", () => {
    const { container } = renderWithProviders(
      <ReviewAgentModal isOpen={true} setIsOpen={vi.fn()} agent={null} onSuccess={vi.fn()} />,
    );
    expect(container.querySelector('[class*="MuiDrawer"]')).toBeNull();
  });
});
