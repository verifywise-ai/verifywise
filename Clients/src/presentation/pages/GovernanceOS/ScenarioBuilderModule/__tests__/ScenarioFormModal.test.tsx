import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ScenarioFormModal from "../ScenarioFormModal";

const existingScenario = {
  id: 1,
  name: "EU High Risk",
  description: "For EU high risk AI systems",
  industry: "technology",
  region: "eu",
  recommended_framework_ids: [1, 2],
  priority_order: { primary: 1, secondary: [2], supplementary: [] },
};

describe("ScenarioFormModal", () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    renderWithProviders(<ScenarioFormModal open={false} onClose={onClose} onSubmit={onSubmit} />);

    expect(screen.queryByText("New Scenario")).not.toBeInTheDocument();
  });

  it("shows 'New Scenario' with empty fields and a disabled submit button", () => {
    renderWithProviders(<ScenarioFormModal open onClose={onClose} onSubmit={onSubmit} />);

    expect(screen.getByText("New Scenario")).toBeInTheDocument();
    expect(screen.getByLabelText("Name", { exact: false })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create Scenario" })).toBeDisabled();
  });

  it("pre-fills fields when editing an existing scenario", () => {
    renderWithProviders(
      <ScenarioFormModal open scenario={existingScenario} onClose={onClose} onSubmit={onSubmit} />,
    );

    expect(screen.getByText("Edit Scenario")).toBeInTheDocument();
    expect(screen.getByLabelText("Name", { exact: false })).toHaveValue("EU High Risk");
    expect(screen.getByLabelText("Description")).toHaveValue("For EU high risk AI systems");
    expect(screen.getByRole("button", { name: "Save Changes" })).not.toBeDisabled();
  });

  it("submits with the name and selected framework once valid", async () => {
    renderWithProviders(<ScenarioFormModal open onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Name", { exact: false }), {
      target: { value: "New Scenario Name" },
    });
    fireEvent.click(screen.getByText("EU AI Act"));

    const submitButton = screen.getByRole("button", { name: "Create Scenario" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    fireEvent.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Scenario Name",
        recommended_framework_ids: [1],
        priority_order: { primary: 1, secondary: [], supplementary: [] },
      }),
    );
  });

  it("selects an industry and region chip", () => {
    renderWithProviders(<ScenarioFormModal open onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText("healthcare"));
    fireEvent.click(screen.getByText("US"));

    fireEvent.change(screen.getByLabelText("Name", { exact: false }), {
      target: { value: "Test" },
    });
    fireEvent.click(screen.getByText("ISO 42001"));

    fireEvent.click(screen.getByRole("button", { name: "Create Scenario" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ industry: "healthcare", region: "us" }),
    );
  });

  it("adds a second framework as secondary priority", () => {
    renderWithProviders(<ScenarioFormModal open onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Name", { exact: false }), {
      target: { value: "Multi Framework" },
    });
    fireEvent.click(screen.getByText("EU AI Act"));
    fireEvent.click(screen.getByText("ISO 42001"));

    expect(screen.getByText(/First selected framework becomes primary/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Scenario" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        recommended_framework_ids: [1, 2],
        priority_order: { primary: 1, secondary: [2], supplementary: [] },
      }),
    );
  });
});
