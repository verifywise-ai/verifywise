import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IShadowAiTool } from "../../../../domain/interfaces/i.shadowAi";

const mockStartGovernance = vi.fn();
vi.mock("../../../../application/repository/shadowAi.repository", () => ({
  startGovernance: (...args: any[]) => mockStartGovernance(...args),
}));

const mockUsers = [
  { id: 1, name: "Alice", surname: "Admin" },
  { id: 2, name: "Bob", surname: "Reviewer" },
];
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mockUsers, loading: false, error: null, refreshUsers: vi.fn() }),
}));

// Select is a heavy MUI dropdown; stub it with a native <select> so tests can
// drive selection directly via fireEvent.change while keeping onChange wiring intact.
vi.mock("../../../components/Inputs/Select", () => ({
  default: ({ id, label, value, items, onChange, placeholder }: any) => (
    <div>
      {label && <label htmlFor={id}>{label}</label>}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange({ target: { value: e.target.value } })}
      >
        <option value="">{placeholder || ""}</option>
        {items.map((item: any) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  ),
}));

import GovernanceWizardModal from "../GovernanceWizardModal";

const baseTool: IShadowAiTool = {
  id: 7,
  name: "ChatGPT",
  vendor: "OpenAI",
  domains: ["chat.openai.com"],
  status: "detected",
  total_users: 12,
  total_events: 340,
};

describe("GovernanceWizardModal", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render its content when closed", () => {
    renderWithProviders(
      <GovernanceWizardModal
        isOpen={false}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.queryByText("Start governance")).not.toBeInTheDocument();
  });

  it("pre-fills provider and model from the tool", () => {
    renderWithProviders(
      <GovernanceWizardModal
        isOpen={true}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByLabelText("Provider")).toHaveValue("OpenAI");
    expect(screen.getByLabelText("Model name")).toHaveValue("ChatGPT");
    expect(
      screen.getByText('Create a model inventory entry for "ChatGPT" and begin formal governance.'),
    ).toBeInTheDocument();
  });

  it("shows a validation error when provider/model are cleared", async () => {
    renderWithProviders(
      <GovernanceWizardModal
        isOpen={true}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Start governance" }));

    await waitFor(() => {
      expect(screen.getByText("Provider and model name are required.")).toBeInTheDocument();
    });
    expect(mockStartGovernance).not.toHaveBeenCalled();
  });

  it("shows a validation error when no governance owner is selected", async () => {
    renderWithProviders(
      <GovernanceWizardModal
        isOpen={true}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start governance" }));

    await waitFor(() => {
      expect(screen.getByText("Governance owner is required.")).toBeInTheDocument();
    });
    expect(mockStartGovernance).not.toHaveBeenCalled();
  });

  it("submits the governance request with the expected payload and calls onSuccess/onClose", async () => {
    mockStartGovernance.mockResolvedValue({ model_inventory_id: 99 });

    renderWithProviders(
      <GovernanceWizardModal
        isOpen={true}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Version (optional)"), { target: { value: "4.0" } });
    fireEvent.change(screen.getByLabelText("Data sensitivity"), { target: { value: "High" } });
    fireEvent.change(screen.getByLabelText("Risk description"), {
      target: { value: "Handles PII" },
    });
    fireEvent.click(screen.getByRole("switch"));

    fireEvent.click(screen.getByRole("button", { name: "Start governance" }));

    await waitFor(() => {
      expect(mockStartGovernance).toHaveBeenCalledWith(7, {
        model_inventory: {
          provider: "OpenAI",
          model: "ChatGPT",
          version: "4.0",
          status: "active",
        },
        governance_owner_id: 1,
        risk_assessment: {
          data_sensitivity: "High",
          description: "Handles PII",
        },
        start_lifecycle: true,
      });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("omits the optional version and risk assessment when left blank", async () => {
    mockStartGovernance.mockResolvedValue({});

    renderWithProviders(
      <GovernanceWizardModal
        isOpen={true}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Start governance" }));

    await waitFor(() => {
      expect(mockStartGovernance).toHaveBeenCalledWith(7, {
        model_inventory: {
          provider: "OpenAI",
          model: "ChatGPT",
          version: undefined,
          status: "active",
        },
        governance_owner_id: 2,
        risk_assessment: undefined,
        start_lifecycle: false,
      });
    });
  });

  it("shows an error message when the request fails", async () => {
    mockStartGovernance.mockRejectedValue(new Error("Network down"));

    renderWithProviders(
      <GovernanceWizardModal
        isOpen={true}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Start governance" }));

    await waitFor(() => {
      expect(screen.getByText("Network down")).toBeInTheDocument();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to a generic error message for non-Error rejections", async () => {
    mockStartGovernance.mockRejectedValue("boom");

    renderWithProviders(
      <GovernanceWizardModal
        isOpen={true}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Start governance" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to start governance.")).toBeInTheDocument();
    });
  });

  it("closes via the cancel button without submitting", () => {
    renderWithProviders(
      <GovernanceWizardModal
        isOpen={true}
        onClose={onClose}
        tool={baseTool}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mockStartGovernance).not.toHaveBeenCalled();
  });
});
