import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ConfirmationModal from "../index";

describe("ConfirmationModal", () => {
  const baseProps = {
    title: "Confirm Action",
    body: <span>Are you sure you want to proceed?</span>,
    cancelText: "Cancel",
    proceedText: "Confirm",
    onCancel: vi.fn(),
    onProceed: vi.fn(),
    proceedButtonVariant: "contained" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal content when isOpen is true", () => {
    renderWithProviders(<ConfirmationModal {...baseProps} isOpen />);

    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to proceed?")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("does not render modal content when isOpen is false", () => {
    renderWithProviders(<ConfirmationModal {...baseProps} isOpen={false} />);

    expect(screen.queryByText("Confirm Action")).not.toBeInTheDocument();
    expect(screen.queryByText("Are you sure you want to proceed?")).not.toBeInTheDocument();
  });

  it("renders by default when isOpen is not provided (defaults to true)", () => {
    renderWithProviders(<ConfirmationModal {...baseProps} />);

    expect(screen.getByText("Confirm Action")).toBeInTheDocument();
  });

  it("calls onProceed when the proceed button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmationModal {...baseProps} isOpen />);

    await user.click(screen.getByText("Confirm"));
    expect(baseProps.onProceed).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmationModal {...baseProps} isOpen />);

    await user.click(screen.getByText("Cancel"));
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when clicking the backdrop", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConfirmationModal {...baseProps} isOpen />);

    const backdrop = document.querySelector(".confirmation-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders the dialog with correct ARIA attributes", () => {
    renderWithProviders(<ConfirmationModal {...baseProps} isOpen />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "confirmation-modal-title");
    expect(dialog).toHaveAttribute("aria-describedby", "confirmation-modal-body");
  });

  it("shows 'Processing...' text when isLoading is true", () => {
    renderWithProviders(<ConfirmationModal {...baseProps} isOpen isLoading />);

    expect(screen.getByText("Processing...")).toBeInTheDocument();
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
  });
});
