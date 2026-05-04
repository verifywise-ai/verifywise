import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EditableText from "../index";

describe("EditableText", () => {
  const defaultProps = {
    value: "Test Value",
    onSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the text value", () => {
    renderWithProviders(<EditableText {...defaultProps} />);
    expect(screen.getByText("Test Value")).toBeInTheDocument();
  });

  it("renders placeholder when value is empty", () => {
    renderWithProviders(<EditableText {...defaultProps} value="" placeholder="Enter text" />);
    expect(screen.getByText("Enter text")).toBeInTheDocument();
  });

  it("shows edit button with correct aria-label", () => {
    renderWithProviders(<EditableText {...defaultProps} editAriaLabel="Edit title" />);
    expect(screen.getByLabelText("Edit title")).toBeInTheDocument();
  });

  it("enters edit mode on edit button click", () => {
    renderWithProviders(<EditableText {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByLabelText("Save")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancel")).toBeInTheDocument();
  });

  it("populates the text field with current value in edit mode", () => {
    renderWithProviders(<EditableText {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByRole("textbox")).toHaveValue("Test Value");
  });

  it("saves on Enter key press", async () => {
    const onSave = vi.fn();
    renderWithProviders(<EditableText value="Old" onSave={onSave} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "New Value" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("New Value");
    });
  });

  it("cancels on Escape key press", () => {
    renderWithProviders(<EditableText {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Test Value")).toBeInTheDocument();
  });

  it("cancels on Cancel button click", () => {
    renderWithProviders(<EditableText {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.click(screen.getByLabelText("Cancel"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not show edit button when disabled", () => {
    renderWithProviders(<EditableText {...defaultProps} disabled />);
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
  });

  it("does not save when value is unchanged", async () => {
    const onSave = vi.fn();
    renderWithProviders(<EditableText value="Same" onSave={onSave} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  it("enforces maxLength on input", () => {
    renderWithProviders(<EditableText {...defaultProps} maxLength={5} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "123456789" } });
    expect(input).toHaveValue("12345");
  });
});
