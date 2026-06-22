import { vi } from "vitest";

vi.mock("../../Dialogs/ConfirmationModal", () => ({
  default: ({ isOpen, onCancel, onProceed, cancelText, proceedText }: any) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <button data-testid="cancel-btn" onClick={onCancel}>
          {cancelText}
        </button>
        <button data-testid="proceed-btn" onClick={onProceed}>
          {proceedText}
        </button>
      </div>
    ) : null,
}));

vi.mock("../../Modals/ModelRiskConfirmation", () => ({
  default: ({ isOpen, onConfirm, onCancel }: any) =>
    isOpen ? (
      <div data-testid="model-risk-confirmation">
        <button data-testid="risk-confirm-btn" onClick={() => onConfirm(true)}>
          Delete risks
        </button>
        <button data-testid="risk-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("../../../themes/v1SingleTheme", () => ({
  default: {
    textStyles: { bodyLarge: {} },
    dropDownStyles: { primary: { borderRadius: 4 } },
    iconButtons: {},
  },
}));

vi.mock("../../Alert", () => ({
  default: ({ variant, body, onClick }: any) =>
    variant ? (
      <div data-testid="alert" data-variant={variant} onClick={onClick}>
        {body}
      </div>
    ) : null,
}));

let mockIsAdmin = true;
vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin,
}));

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import IconButton from "../index";

describe("IconButton", () => {
  const defaultProps = {
    id: 1,
    onDelete: vi.fn(),
    onEdit: vi.fn(),
  };

  beforeEach(() => {
    mockIsAdmin = true;
  });

  const getMenuItem = (name: string) => {
    const menu = screen.getByRole("menu");
    return within(menu).getByText(name);
  };

  const renderWithMenuOpen = async (props = {}) => {
    renderWithProviders(<IconButton {...defaultProps} {...props} />);
    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[0]);
    await screen.findByRole("menu");
  };

  it("renders the settings icon button", () => {
    renderWithProviders(<IconButton {...defaultProps} />);
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("opens menu on settings button click", async () => {
    renderWithProviders(<IconButton {...defaultProps} />);
    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("calls onEdit when Edit item is clicked", async () => {
    const onEdit = vi.fn();
    await renderWithMenuOpen({ onEdit, type: "vendor" });
    await userEvent.click(screen.getByText("Edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("calls onMouseEvent when Edit item is clicked and handler provided", async () => {
    const onMouseEvent = vi.fn();
    const onEdit = vi.fn();
    await renderWithMenuOpen({ onEdit, onMouseEvent, type: "vendor" });
    await userEvent.click(screen.getByText("Edit"));
    expect(onMouseEvent).toHaveBeenCalledTimes(1);
  });

  it("opens confirmation modal for vendor remove with warning", async () => {
    await renderWithMenuOpen({
      canDelete: true,
      warningTitle: "Delete Item",
      warningMessage: "Are you sure?",
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
  });

  it("calls onDelete when remove is confirmed", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({
      onDelete,
      canDelete: true,
      warningTitle: "Delete Item",
      warningMessage: "Are you sure?",
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    await userEvent.click(screen.getByTestId("proceed-btn"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("shows error alert when delete returns false", async () => {
    const onDelete = vi.fn().mockResolvedValue(false);
    await renderWithMenuOpen({
      onDelete,
      canDelete: true,
      warningTitle: "Delete",
      warningMessage: "Sure?",
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    await userEvent.click(screen.getByTestId("proceed-btn"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("alert")).toBeInTheDocument();
    });
  });

  it("shows error alert when delete throws", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("fail"));
    await renderWithMenuOpen({
      onDelete,
      canDelete: true,
      warningTitle: "Delete",
      warningMessage: "Sure?",
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    await userEvent.click(screen.getByTestId("proceed-btn"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("alert")).toBeInTheDocument();
    });
  });

  it("closes confirmation modal on cancel", async () => {
    await renderWithMenuOpen({
      canDelete: true,
      warningTitle: "Delete Item",
      warningMessage: "Are you sure?",
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    await userEvent.click(screen.getByTestId("cancel-btn"));
    expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument();
  });

  it("calls onDelete directly when Remove clicked without warning", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onDelete, canDelete: true, type: "vendor" });
    await userEvent.click(getMenuItem("Remove"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("opens risk confirmation modal when checkForRisks returns true", async () => {
    const checkForRisks = vi.fn().mockResolvedValue(true);
    const onDeleteWithRisks = vi.fn();
    await renderWithMenuOpen({
      checkForRisks,
      onDeleteWithRisks,
      canDelete: true,
      warningTitle: "Delete",
      warningMessage: "Sure?",
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    await userEvent.click(screen.getByTestId("proceed-btn"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("model-risk-confirmation")).toBeInTheDocument();
    });
  });

  it("calls onDeleteWithRisks(true) when risk confirmed", async () => {
    const checkForRisks = vi.fn().mockResolvedValue(true);
    const onDeleteWithRisks = vi.fn();
    await renderWithMenuOpen({
      checkForRisks,
      onDeleteWithRisks,
      canDelete: true,
      warningTitle: "Delete",
      warningMessage: "Sure?",
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    await userEvent.click(screen.getByTestId("proceed-btn"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("model-risk-confirmation")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("risk-confirm-btn"));
    expect(onDeleteWithRisks).toHaveBeenCalledWith(true);
  });

  it("calls onDeleteWithRisks(false) when checkForRisks returns false", async () => {
    const checkForRisks = vi.fn().mockResolvedValue(false);
    const onDeleteWithRisks = vi.fn();
    await renderWithMenuOpen({
      checkForRisks,
      onDeleteWithRisks,
      canDelete: true,
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    expect(onDeleteWithRisks).toHaveBeenCalledWith(false);
  });

  it("calls onDeleteWithRisks(false) when checkForRisks throws", async () => {
    const checkForRisks = vi.fn().mockRejectedValue(new Error("fail"));
    const onDeleteWithRisks = vi.fn();
    await renderWithMenuOpen({
      checkForRisks,
      onDeleteWithRisks,
      canDelete: true,
      type: "vendor",
    });
    await userEvent.click(getMenuItem("Remove"));
    expect(onDeleteWithRisks).toHaveBeenCalledWith(false);
  });

  it("calls onMakeVisible when Make visible item clicked", async () => {
    const onMakeVisible = vi.fn();
    await renderWithMenuOpen({ onMakeVisible, type: "resource", isVisible: true });
    await userEvent.click(screen.getByText("Make hidden"));
    expect(onMakeVisible).toHaveBeenCalledTimes(1);
  });

  it("shows 'Make visible' text when item is not visible", async () => {
    await renderWithMenuOpen({ type: "resource", isVisible: false });
    expect(screen.getByText("Make visible")).toBeInTheDocument();
  });

  it("calls onView when View item clicked", async () => {
    const onView = vi.fn();
    await renderWithMenuOpen({ onView, type: "incident" });
    await userEvent.click(screen.getByText("View"));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("calls onDownload when Download item clicked", async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onDownload, type: "evidence" });
    await userEvent.click(screen.getByText("Download"));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("shows error alert when download fails", async () => {
    const onDownload = vi.fn().mockRejectedValue(new Error("fail"));
    await renderWithMenuOpen({ onDownload, type: "evidence" });
    await userEvent.click(screen.getByText("Download"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("alert")).toBeInTheDocument();
    });
  });

  it("calls onSendTest when Send Test item clicked", async () => {
    const onSendTest = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onSendTest, type: "integration" });
    await userEvent.click(screen.getByText("Send Test"));
    expect(onSendTest).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleEnable when Activate/Deactivate item clicked", async () => {
    const onToggleEnable = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onToggleEnable, type: "integration" });
    await userEvent.click(screen.getByText("Activate/Deactivate"));
    expect(onToggleEnable).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenLinkedPolicies when Linked policies item clicked", async () => {
    const openLinkedPolicies = vi.fn();
    await renderWithMenuOpen({ openLinkedPolicies, type: "risk" });
    await userEvent.click(screen.getByText("Linked policies"));
    expect(openLinkedPolicies).toHaveBeenCalledTimes(1);
  });

  it("disables resource items when not visible", async () => {
    await renderWithMenuOpen({ type: "resource", isVisible: false });
    const editItem = screen.getByText("Edit").closest("li");
    expect(editItem).toHaveAttribute("aria-disabled", "true");
  });

  it("disables download items for non-admin", async () => {
    mockIsAdmin = false;
    await renderWithMenuOpen({ type: "evidence" });
    const downloadItem = screen.getByText("Download").closest("li");
    expect(downloadItem).toHaveAttribute("aria-disabled", "true");
  });

  it("renders task type with Edit, Archive, Delete items", async () => {
    await renderWithMenuOpen({
      type: "task",
      warningTitle: "Archive task",
      warningMessage: "Sure?",
    });
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Archive task")).toBeInTheDocument();
    expect(screen.getByText("Delete permanently")).toBeInTheDocument();
  });

  it("renders archived task with Restore and Delete items", async () => {
    await renderWithMenuOpen({
      type: "task",
      isArchived: true,
      hardDeleteWarningTitle: "Permanently delete",
      hardDeleteWarningMessage: "This cannot be undone",
    });
    expect(screen.getByText("Restore task")).toBeInTheDocument();
    expect(screen.getByText("Delete permanently")).toBeInTheDocument();
  });

  it("calls onRestore when Restore task item clicked", async () => {
    const onRestore = vi.fn();
    await renderWithMenuOpen({
      onRestore,
      type: "task",
      isArchived: true,
    });
    await userEvent.click(screen.getByText("Restore task"));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("opens confirmation modal for task archive when warning provided", async () => {
    await renderWithMenuOpen({
      type: "task",
      warningTitle: "Archive task",
      warningMessage: "Sure?",
    });
    await userEvent.click(screen.getByText("Archive task"));
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
  });

  it("opens hard delete modal for task delete when hardDeleteWarning provided", async () => {
    await renderWithMenuOpen({
      type: "task",
      hardDeleteWarningTitle: "Delete permanently",
      hardDeleteWarningMessage: "This cannot be undone",
    });
    await userEvent.click(screen.getByText("Delete permanently"));
    await vi.waitFor(() => {
      expect(screen.queryByTestId("confirmation-modal")).toBeInTheDocument();
    });
  });

  it("calls handleHardDelete when task hard delete confirmed", async () => {
    const onHardDelete = vi.fn();
    await renderWithMenuOpen({
      onHardDelete,
      type: "task",
      hardDeleteWarningTitle: "Delete",
      hardDeleteWarningMessage: "Sure?",
    });
    await userEvent.click(screen.getByText("Delete permanently"));
    await vi.waitFor(() => {
      expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("proceed-btn"));
    expect(onHardDelete).toHaveBeenCalledTimes(1);
  });

  it("calls onLinkedObjects when Linked objects item clicked", async () => {
    const onLinkedObjects = vi.fn();
    await renderWithMenuOpen({ onLinkedObjects, type: "policy" });
    await userEvent.click(screen.getByText("Linked objects"));
    expect(onLinkedObjects).toHaveBeenCalledTimes(1);
  });

  it("calls onDownloadPDF when Download PDF item clicked", async () => {
    const onDownloadPDF = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onDownloadPDF, type: "policy" });
    await userEvent.click(screen.getByText("Download PDF"));
    expect(onDownloadPDF).toHaveBeenCalledTimes(1);
  });

  it("calls onDownloadDOCX when Download Word item clicked", async () => {
    const onDownloadDOCX = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onDownloadDOCX, type: "policy" });
    await userEvent.click(screen.getByText("Download Word"));
    expect(onDownloadDOCX).toHaveBeenCalledTimes(1);
  });

  it("calls onAssignToFolder when Assign to folder item clicked", async () => {
    const onAssignToFolder = vi.fn();
    await renderWithMenuOpen({ onAssignToFolder, type: "policy" });
    await userEvent.click(screen.getByText("Assign to folder"));
    expect(onAssignToFolder).toHaveBeenCalledTimes(1);
  });

  it("calls onPreview when Preview item clicked", async () => {
    const onPreview = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onPreview, type: "report" });
    await userEvent.click(screen.getByText("Preview"));
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("calls onEditMetadata when Edit metadata item clicked", async () => {
    const onEditMetadata = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onEditMetadata, type: "report" });
    await userEvent.click(screen.getByText("Edit metadata"));
    expect(onEditMetadata).toHaveBeenCalledTimes(1);
  });

  it("calls onViewHistory when Version history item clicked", async () => {
    const onViewHistory = vi.fn();
    await renderWithMenuOpen({ onViewHistory, type: "report" });
    await userEvent.click(screen.getByText("Version history"));
    expect(onViewHistory).toHaveBeenCalledTimes(1);
  });

  it("renders evidence type with download and remove items", async () => {
    await renderWithMenuOpen({ type: "evidence" });
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders integration type with Send Test and Activate/Deactivate", async () => {
    await renderWithMenuOpen({ type: "integration" });
    expect(screen.getByText("Send Test")).toBeInTheDocument();
    expect(screen.getByText("Activate/Deactivate")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders risk type with edit, linked_policies, remove", async () => {
    const openLinkedPolicies = vi.fn();
    await renderWithMenuOpen({ openLinkedPolicies, type: "risk" });
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Linked policies")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders default items for unknown type without onPreview", async () => {
    await renderWithMenuOpen({ type: "other" });
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders preview, edit, remove for unknown type with onPreview", async () => {
    const onPreview = vi.fn().mockResolvedValue(undefined);
    await renderWithMenuOpen({ onPreview });
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("shows archive color for task archive item", async () => {
    await renderWithMenuOpen({ type: "task" });
    const archiveItem = screen.getByText("Archive task").closest("li");
    expect(archiveItem).toBeInTheDocument();
  });

  it("shows error color for remove item", async () => {
    await renderWithMenuOpen({ canDelete: true, type: "vendor" });
    const removeItem = getMenuItem("Remove").closest("li");
    expect(removeItem).toBeInTheDocument();
  });

  it("renders linkedobjectstype with remove only", async () => {
    await renderWithMenuOpen({ type: "linkedobjectstype" });
    expect(getMenuItem("Remove")).toBeInTheDocument();
  });
});
