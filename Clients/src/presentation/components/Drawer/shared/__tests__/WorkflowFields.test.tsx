import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import WorkflowFields, { type WorkflowFormData } from "../WorkflowFields";

vi.mock("../../../RichTextEditor", () => ({
  default: ({
    initialContent,
    placeholder,
    onContentChange,
  }: {
    initialContent?: string;
    placeholder?: string;
    onContentChange?: (content: string) => void;
  }) => (
    <div data-testid="rich-text-editor">
      <div data-testid="editor-initial">{initialContent}</div>
      <div data-testid="editor-placeholder">{placeholder}</div>
      <button data-testid="editor-change" onClick={() => onContentChange?.("updated content")}>
        Change content
      </button>
    </div>
  ),
}));

const statusOptions = [
  { id: "Not started", name: "Not started" },
  { id: "In progress", name: "In progress" },
];

const memberOptions = [
  { _id: "", name: "(none)" },
  { _id: 1, name: "Alice" },
];

const baseFormData: WorkflowFormData = {
  status: "Not started",
  implementation_description: "",
  owner: "",
  reviewer: "",
  approver: "",
  auditor_feedback: "",
};

function baseProps(overrides: Partial<React.ComponentProps<typeof WorkflowFields>> = {}) {
  return {
    formData: baseFormData,
    onFieldChange: vi.fn(),
    date: null,
    onDateChange: vi.fn(),
    statusOptions,
    memberOptions,
    ...overrides,
  };
}

describe("WorkflowFields", () => {
  it("renders the rich text editor with the implementation description content", () => {
    renderWithProviders(
      <WorkflowFields {...baseProps({ formData: { ...baseFormData, implementation_description: "Existing desc" } })} />,
    );

    expect(screen.getByTestId("editor-initial")).toHaveTextContent("Existing desc");
  });

  it("hides the implementation description block when showImplementationDescription is false", () => {
    renderWithProviders(<WorkflowFields {...baseProps({ showImplementationDescription: false })} />);

    expect(screen.queryByTestId("rich-text-editor")).not.toBeInTheDocument();
  });

  it("calls onFieldChange when the rich text editor content changes", () => {
    const onFieldChange = vi.fn();
    renderWithProviders(<WorkflowFields {...baseProps({ onFieldChange })} />);

    fireEvent.click(screen.getByTestId("editor-change"));

    expect(onFieldChange).toHaveBeenCalledWith("implementation_description", "updated content");
  });

  it("uses a custom implementation description label and placeholder", () => {
    renderWithProviders(
      <WorkflowFields
        {...baseProps({
          implementationDescriptionLabel: "How is this addressed?",
          implementationDescriptionPlaceholder: "Explain here",
        })}
      />,
    );

    expect(screen.getByText("How is this addressed?")).toBeInTheDocument();
    expect(screen.getByTestId("editor-placeholder")).toHaveTextContent("Explain here");
  });

  it("renders status, owner, reviewer, and approver selects", () => {
    renderWithProviders(<WorkflowFields {...baseProps()} />);

    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getByText("Owner:")).toBeInTheDocument();
    expect(screen.getByText("Reviewer:")).toBeInTheDocument();
    expect(screen.getByText("Approver:")).toBeInTheDocument();
  });

  it("calls onFieldChange with the new status when the status select changes", async () => {
    const onFieldChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<WorkflowFields {...baseProps({ onFieldChange })} />);

    const [statusCombobox] = screen.getAllByRole("combobox");
    await user.click(statusCombobox);
    await user.click(screen.getByText("In progress"));

    expect(onFieldChange).toHaveBeenCalledWith("status", "In progress");
  });

  it("parses the owner value as an integer by default", async () => {
    const onFieldChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<WorkflowFields {...baseProps({ onFieldChange })} />);

    const [, ownerCombobox] = screen.getAllByRole("combobox");
    await user.click(ownerCombobox);
    await user.click(screen.getByText("Alice"));

    expect(onFieldChange).toHaveBeenCalledWith("owner", "1");
  });

  it("renders the due date picker and forwards date changes", () => {
    const onDateChange = vi.fn();
    renderWithProviders(<WorkflowFields {...baseProps({ onDateChange })} />);

    expect(screen.getByText("Due date:")).toBeInTheDocument();
  });

  it("renders the auditor feedback field with a custom label and placeholder", () => {
    renderWithProviders(
      <WorkflowFields
        {...baseProps({
          auditorFeedbackLabel: "Audit notes",
          auditorFeedbackPlaceholder: "Write findings",
        })}
      />,
    );

    expect(screen.getByText("Audit notes")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write findings")).toBeInTheDocument();
  });

  it("calls onFieldChange when the auditor feedback field changes", () => {
    const onFieldChange = vi.fn();
    renderWithProviders(<WorkflowFields {...baseProps({ onFieldChange })} />);

    fireEvent.change(screen.getByPlaceholderText("Enter audit feedback..."), {
      target: { value: "Looks good" },
    });

    expect(onFieldChange).toHaveBeenCalledWith("auditor_feedback", "Looks good");
  });

  it("disables editing-related fields when isEditingDisabled", () => {
    renderWithProviders(<WorkflowFields {...baseProps({ isEditingDisabled: true })} />);

    expect(screen.getByLabelText("Status:").closest(".Mui-disabled")).toBeTruthy();
  });

  it("disables the auditor feedback field when isAuditingDisabled", () => {
    renderWithProviders(<WorkflowFields {...baseProps({ isAuditingDisabled: true })} />);

    expect(screen.getByPlaceholderText("Enter audit feedback...")).toBeDisabled();
  });
});
