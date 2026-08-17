import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import MappingFormModal from "../MappingFormModal";

const existingMapping = {
  id: 1,
  organization_id: 1,
  source_framework_id: 1,
  source_control_type: "article",
  source_control_identifier: "Article 9",
  target_framework_id: 2,
  target_control_type: "control",
  target_control_identifier: "A.5.1",
  mapping_strength: "partial" as const,
  mapping_direction: "forward" as const,
  domain_tag: "risk_management",
  rationale: "Both address risk controls",
  confidence_score: 0.7,
};

describe("MappingFormModal", () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    renderWithProviders(<MappingFormModal open={false} onClose={onClose} onSubmit={onSubmit} />);

    expect(screen.queryByText("New Mapping")).not.toBeInTheDocument();
  });

  it("shows 'New Mapping' title with empty fields when creating", () => {
    renderWithProviders(<MappingFormModal open onClose={onClose} onSubmit={onSubmit} />);

    expect(screen.getByText("New Mapping")).toBeInTheDocument();
    expect(screen.getByLabelText("Source Control Identifier *")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create Mapping" })).toBeDisabled();
  });

  it("pre-fills fields when editing an existing mapping", () => {
    renderWithProviders(
      <MappingFormModal open mapping={existingMapping} onClose={onClose} onSubmit={onSubmit} />,
    );

    expect(screen.getByText("Edit Mapping")).toBeInTheDocument();
    expect(screen.getByLabelText("Source Control Identifier *")).toHaveValue("Article 9");
    expect(screen.getByLabelText("Target Control Identifier *")).toHaveValue("A.5.1");
    expect(screen.getByLabelText("Rationale")).toHaveValue("Both address risk controls");
    expect(screen.getByRole("button", { name: "Save Changes" })).not.toBeDisabled();
  });

  it("enables submit once required fields are filled and submits the form", async () => {
    renderWithProviders(<MappingFormModal open onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Source Control Identifier *"), {
      target: { value: "Article 5" },
    });
    fireEvent.change(screen.getByLabelText("Target Control Identifier *"), {
      target: { value: "A.1.1" },
    });

    const submitButton = screen.getByRole("button", { name: "Create Mapping" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());

    fireEvent.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        source_control_identifier: "Article 5",
        target_control_identifier: "A.1.1",
        mapping_strength: "related",
        confidence_score: 0.8,
      }),
    );
  });

  it("changes the source framework selection when a chip is clicked", () => {
    renderWithProviders(<MappingFormModal open onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.click(screen.getAllByText("ISO 27001")[0]);

    fireEvent.change(screen.getByLabelText("Source Control Identifier *"), {
      target: { value: "A.9" },
    });
    fireEvent.change(screen.getByLabelText("Target Control Identifier *"), {
      target: { value: "A.1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Mapping" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ source_framework_id: 3 }),
    );
  });

  it("changes mapping strength when a strength chip is clicked", () => {
    renderWithProviders(<MappingFormModal open onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText("direct"));

    fireEvent.change(screen.getByLabelText("Source Control Identifier *"), {
      target: { value: "Article 5" },
    });
    fireEvent.change(screen.getByLabelText("Target Control Identifier *"), {
      target: { value: "A.1.1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Mapping" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mapping_strength: "direct" }));
  });
});
