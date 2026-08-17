import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { PolicyEditorTitleArea, type PolicyEditorTitleAreaProps } from "../PolicyEditorTitleArea";

function baseProps(overrides: Partial<PolicyEditorTitleAreaProps> = {}): PolicyEditorTitleAreaProps {
  return {
    pageTitle: "AI Ethics Policy",
    isEditingTitle: false,
    editedTitle: "",
    isSavingTitle: false,
    onBack: vi.fn(),
    onStartEditTitle: vi.fn(),
    onEditedTitleChange: vi.fn(),
    onSaveTitle: vi.fn(),
    onCancelEditTitle: vi.fn(),
    ...overrides,
  };
}

describe("PolicyEditorTitleArea", () => {
  it("renders the page title when not editing", () => {
    renderWithProviders(<PolicyEditorTitleArea {...baseProps()} />);
    expect(screen.getByText("AI Ethics Policy")).toBeInTheDocument();
  });

  it("calls onBack when the back button is clicked", () => {
    const onBack = vi.fn();
    renderWithProviders(<PolicyEditorTitleArea {...baseProps({ onBack })} />);
    fireEvent.click(screen.getByRole("button", { name: /back to policies/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it("calls onStartEditTitle when the pencil icon is clicked", () => {
    const onStartEditTitle = vi.fn();
    renderWithProviders(<PolicyEditorTitleArea {...baseProps({ onStartEditTitle })} />);
    const buttons = screen.getAllByRole("button");
    // Back button + edit-title button
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onStartEditTitle).toHaveBeenCalled();
  });

  it("renders a text field with the edited title when editing", () => {
    renderWithProviders(
      <PolicyEditorTitleArea {...baseProps({ isEditingTitle: true, editedTitle: "New title" })} />,
    );
    expect(screen.getByDisplayValue("New title")).toBeInTheDocument();
  });

  it("calls onEditedTitleChange when typing in the text field", () => {
    const onEditedTitleChange = vi.fn();
    renderWithProviders(
      <PolicyEditorTitleArea
        {...baseProps({ isEditingTitle: true, editedTitle: "New", onEditedTitleChange })}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("New"), { target: { value: "New t" } });
    expect(onEditedTitleChange).toHaveBeenCalledWith("New t");
  });

  it("calls onSaveTitle when Enter is pressed in the text field", () => {
    const onSaveTitle = vi.fn();
    renderWithProviders(
      <PolicyEditorTitleArea
        {...baseProps({ isEditingTitle: true, editedTitle: "New", onSaveTitle })}
      />,
    );
    fireEvent.keyDown(screen.getByDisplayValue("New"), { key: "Enter" });
    expect(onSaveTitle).toHaveBeenCalled();
  });

  it("calls onCancelEditTitle when Escape is pressed in the text field", () => {
    const onCancelEditTitle = vi.fn();
    renderWithProviders(
      <PolicyEditorTitleArea
        {...baseProps({ isEditingTitle: true, editedTitle: "New", onCancelEditTitle })}
      />,
    );
    fireEvent.keyDown(screen.getByDisplayValue("New"), { key: "Escape" });
    expect(onCancelEditTitle).toHaveBeenCalled();
  });

  it("calls onSaveTitle when the confirm icon button is clicked", () => {
    const onSaveTitle = vi.fn();
    renderWithProviders(
      <PolicyEditorTitleArea
        {...baseProps({ isEditingTitle: true, editedTitle: "New", onSaveTitle })}
      />,
    );
    const buttons = screen.getAllByRole("button");
    // Back, confirm, cancel
    fireEvent.click(buttons[1]);
    expect(onSaveTitle).toHaveBeenCalled();
  });

  it("calls onCancelEditTitle when the cancel icon button is clicked", () => {
    const onCancelEditTitle = vi.fn();
    renderWithProviders(
      <PolicyEditorTitleArea
        {...baseProps({ isEditingTitle: true, editedTitle: "New", onCancelEditTitle })}
      />,
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[2]);
    expect(onCancelEditTitle).toHaveBeenCalled();
  });

  it("disables the confirm button when the edited title is blank", () => {
    renderWithProviders(<PolicyEditorTitleArea {...baseProps({ isEditingTitle: true, editedTitle: "   " })} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toBeDisabled();
  });

  it("shows a loading spinner and disables fields while saving", () => {
    renderWithProviders(
      <PolicyEditorTitleArea
        {...baseProps({ isEditingTitle: true, editedTitle: "New", isSavingTitle: true })}
      />,
    );
    expect(screen.getByDisplayValue("New")).toBeDisabled();
  });

  it("shows the title error message when provided", () => {
    renderWithProviders(
      <PolicyEditorTitleArea
        {...baseProps({ isEditingTitle: true, editedTitle: "New", titleError: "Title required" })}
      />,
    );
    expect(screen.getByText("Title required")).toBeInTheDocument();
  });
});
