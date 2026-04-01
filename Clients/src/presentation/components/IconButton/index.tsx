/**
 * IconButton component that renders a custom-styled Material-UI IconButton with a settings icon.
 * It includes a dropdown menu with options to edit or remove a vendor, and modals for adding or removing vendors.
 *
 * @component
 * @returns {JSX.Element} The rendered IconButton component with associated dropdown menu and modals.
 */

import {
  Menu,
  MenuItem,
  IconButton as MuiIconButton,
  useTheme,
  Tooltip,
} from "@mui/material";
import { Settings } from "lucide-react";
import { useState, type JSX } from "react";
import ConfirmationModal from "../Dialogs/ConfirmationModal";
import { Typography } from "@mui/material";
import ModelRiskConfirmation from "../Modals/ModelRiskConfirmation";
import singleTheme from "../../themes/v1SingleTheme";
import Alert from "../Alert";
import { IconButtonProps } from "../../types/widget.types";
import { AlertProps } from "../../types/alert.types";
import { useIsAdmin } from "../../../application/hooks/useIsAdmin";

function IconButton({
  id,
  onDelete,
  onEdit,
  warningTitle,
  warningMessage,
  type,
  onMouseEvent,
  onMakeVisible,
  onDownload,
  isVisible,
  canDelete,
  checkForRisks,
  onDeleteWithRisks,
  onView,
  openLinkedPolicies,
  entityId: _entityId,
  onSendTest,
  onToggleEnable,
  // Task-specific props
  isArchived,
  onRestore,
  onHardDelete,
  onLinkedObjects,
  hardDeleteWarningTitle,
  hardDeleteWarningMessage,
  // Policy export props
  onDownloadPDF,
  onDownloadDOCX,
  // Virtual folder props
  onAssignToFolder,
  // File metadata props
  onPreview,
  onEditMetadata,
  onViewHistory,
}: IconButtonProps) {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isOpenRemoveModal, setIsOpenRemoveModal] = useState(false);
  const [isOpenHardDeleteModal, setIsOpenHardDeleteModal] = useState(false);
  const [isOpenRiskConfirmationModal, setIsOpenRiskConfirmationModal] =
    useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const isAdmin = useIsAdmin();

  const dropDownStyle = singleTheme.dropDownStyles.primary;

  const openMenu = (event: React.MouseEvent<HTMLElement>, _id: string | number, _url: string) => {
    event.preventDefault();
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  function closeDropDownMenu(e: React.SyntheticEvent) {
    e.stopPropagation();
    setAnchorEl(null);
  }

  const [_isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e?: React.SyntheticEvent) => {
    setIsDeleting(true);
    setIsOpenRemoveModal(false);

    if (e) {
      closeDropDownMenu(e);
    }

    try {
      const result = await onDelete();
      if (result === false) {
        setAlert({ variant: "error", body: "Failed to delete. Please try again.", isToast: true });
      }
    } catch {
      setAlert({ variant: "error", body: "Failed to delete. Please try again.", isToast: true });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteWithRiskCheck = async (e?: React.SyntheticEvent) => {
    if (checkForRisks && onDeleteWithRisks) {
      try {
        const hasRisks = await checkForRisks();
        if (hasRisks) {
          setIsOpenRiskConfirmationModal(true);
        } else {
          onDeleteWithRisks(false);
        }
      } catch (error) {
        console.error("Error checking for risks:", error);
        onDeleteWithRisks(false);
      }
      setIsOpenRemoveModal(false);
      if (e) {
        closeDropDownMenu(e);
      }
    } else {
      await handleDelete(e);
    }
  };

  const handleRiskConfirmation = (deleteRisks: boolean) => {
    if (onDeleteWithRisks) {
      onDeleteWithRisks(deleteRisks);
    }
  };

  const handleRiskConfirmationCancel = () => {
    setIsOpenRiskConfirmationModal(false);
  };

  const handleEdit = (e?: React.SyntheticEvent) => {
    onEdit();
    if (e) {
      closeDropDownMenu(e);
      onMouseEvent?.(e);
    }
  };

  const handleView = (e?: React.SyntheticEvent) => {
    if (onView) {
      onView();
      if (e) {
        closeDropDownMenu(e);
        onMouseEvent?.(e);
      }
    }
  };

  const handleOpenLinkedPolicies = (e?: React.SyntheticEvent) => {
    if (openLinkedPolicies) {
      openLinkedPolicies();
      if (e) {
        closeDropDownMenu(e);
      }
    }
  };

  const handleMakeVisible = (e?: React.SyntheticEvent) => {
    if (onMakeVisible) {
      onMakeVisible();
    }
    if (e) {
      closeDropDownMenu(e);
    }
  };

  const handleDownload = async (e?: React.SyntheticEvent) => {
    try {
      if (onDownload) {
        await onDownload();
      }
    } catch (error) {
      console.error("Download failed:", error);
      setAlert({
        variant: "error",
        body: "Failed to download file. Please try again.",
        isToast: true,
      });
    } finally {
      if (e) {
        closeDropDownMenu(e);
      }
    }
  };

  const handleSendTestNotification = async (e?: React.SyntheticEvent) => {
    if (onSendTest) {
      await onSendTest();
    }
    if (e) {
      closeDropDownMenu(e);
    }
  };

  const handleToggleStatus = async (e?: React.SyntheticEvent) => {
    if (onToggleEnable) {
      await onToggleEnable();
    }
    if (e) {
      closeDropDownMenu(e);
    }
  };

  const handleRestore = (e?: React.SyntheticEvent) => {
    if (onRestore) {
      onRestore();
    }
    if (e) {
      closeDropDownMenu(e);
    }
  };

  const handleLinkedObjects = (e?: React.SyntheticEvent) => {
    if (onLinkedObjects) {
      onLinkedObjects();
    }
    if (e) {
      closeDropDownMenu(e);
    }
  };

  const handleHardDelete = (e?: React.SyntheticEvent) => {
    if (onHardDelete) {
      onHardDelete();
    }
    setIsOpenHardDeleteModal(false);
    if (e) {
      closeDropDownMenu(e);
    }
  };

  const handleDownloadPDF = async (e?: React.SyntheticEvent) => {
    if (onDownloadPDF) {
      await onDownloadPDF();
    }
    if (e) {
      closeDropDownMenu(e);
    }
  };

  const handleDownloadDOCX = async (e?: React.SyntheticEvent) => {
    if (onDownloadDOCX) {
      await onDownloadDOCX();
    }
    if (e) {
      closeDropDownMenu(e);
    }
  };

  function handleCancel(e?: React.SyntheticEvent) {
    setIsOpenRemoveModal(false);
    if (e) {
      closeDropDownMenu(e);
    }
  }

  /**
   * List of context-specific dropdown actions used to render menu items.
   *
   * - For type "evidence", the menu item will be "download","remove".
   * - For type "report", the menu item will be "download", "remove".
   * - For type "Resource", the menu item will be "edit", "make visible", "download", "remove".
   * - For type "integration" (e.g., Slack), the menu item will be "Send Test", "Activate/Deactivate" "remove".
   * - For type "Task" (active), the menu item will be "edit", "archive", "delete".
   * - For type "Task" (archived), the menu item will be "restore", "delete".
   * - For other types (e.g. "Vendor"), the menu item will be "edit", "remove".
   */

  type ButtonType =
  | "report"
  | "evidence"
  | "resource"
  | "incident"
  | "integration"
  | "policy"
  | "linkedobjectstype"
  | "risk";

  const BUTTONS_BY_TYPE: Record<ButtonType, string[]> = {
    report: [], // Handled dynamically in getListOfButtons
    evidence: ["download", "remove"],
    resource: ["edit", "make visible", "download", "remove"],
    incident: ["edit", "view", "archive"],
    integration: ["Send Test", "Activate/Deactivate", "remove"],
    policy: [], // Handled dynamically in getListOfButtons
    linkedobjectstype: ["remove"],
    risk: ["edit", "linked_policies", "remove"],
  };



  const getListOfButtons = () => {
    const normalizedType = type?.toLowerCase();

    if (normalizedType === "task") {
      return isArchived
        ? ["restore", "delete"]
        : ["edit", "archive", "delete"];
    }

    if (normalizedType === "vendor") {
      return canDelete ? ["edit", "remove"] : ["edit"];
    }

    // Handle "report" type dynamically to check props at render time
    if (normalizedType === "report") {
      const items = ["preview", "download"];
      if (onEditMetadata) items.push("edit_metadata");
      if (onAssignToFolder) items.push("assign_folder");
      if (onViewHistory) items.push("version_history");
      items.push("linked_policies", "remove");
      return items;
    }

    // Handle "policy" type dynamically to include assign_folder when available
    if (normalizedType === "policy") {
      const items = ["edit", "link_objects"];
      if (onAssignToFolder) items.push("assign_folder");
      items.push("download_pdf", "download_docx", "remove");
      return items;
    }

    if (normalizedType && normalizedType in BUTTONS_BY_TYPE) {
      return BUTTONS_BY_TYPE[normalizedType as ButtonType];
    }

    return ["edit", "remove"];
  };

  const listOfButtons = getListOfButtons();

  /**
   * Gets the display text for menu items, with special handling for visibility toggle
   */

  const getMenuItemText = (item: string) => {
    const normalizedType = type?.toLowerCase();

    // Dynamic case stays explicit
    if (item === "make visible") {
      return isVisible ? "Make hidden" : "Make visible";
    }

    const LABELS_BY_TYPE: Record<string, Record<string, string>> = {
      incident: {
        archive: "Archive incident",
      },
      task: {
        archive: "Archive task",
        delete: "Delete permanently",
        restore: "Restore task",
      },
    };

    const COMMON_ITEM_LABELS: Record<string, string> = {
      link_objects: "Linked objects",
      linked_policies: "Linked policies",
      download_pdf: "Download PDF",
      download_docx: "Download Word",
      assign_folder: "Assign to folder",
      preview: "Preview",
      edit_metadata: "Edit metadata",
      version_history: "Version history",
    };

    // Type-specific
    const typeLabel = normalizedType ? LABELS_BY_TYPE[normalizedType]?.[item] : undefined;
    if (typeLabel) {
      return typeLabel;
    }

    // Shared labels across multiple types
    if (COMMON_ITEM_LABELS[item]) {
      return COMMON_ITEM_LABELS[item];
    }
    return item.charAt(0).toUpperCase() + item.slice(1);
  };



  const dropDownListOfOptions: JSX.Element = (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={(e: React.SyntheticEvent) => closeDropDownMenu(e)}
      slotProps={{
        paper: {
          sx: dropDownStyle,
        },
      }}
    >
      {listOfButtons.map((item) => {
        // For resources, disable edit, download, and remove when not visible
        const isResourceAction =
          (type === "Resource" || type === "resource") &&
          item !== "make visible";
        const isResourceDisabled = isResourceAction && !isVisible;

        // Disable download actions for non-admin users
        const isDownloadAction = ["download", "download_pdf", "download_docx"].includes(item);
        const isDownloadDisabled = isDownloadAction && !isAdmin;

        const isDisabled = isResourceDisabled || isDownloadDisabled;

        return (
          <Tooltip
            key={`tooltip-${item}`}
            title={isDownloadDisabled ? "Only admins can download files" : ""}
            placement="left"
          >
          <MenuItem
            key={item}
            onClick={async (e) => {
              // Prevent actions when disabled
              if (isDisabled) {
                e.stopPropagation();
                return;
              }

              if (item === "edit") {
                handleEdit(e);
              } else if (item === "download") {
                await handleDownload(e);
              } else if (item === "make visible") {
                handleMakeVisible(e);
              } else if (item === "view") {
                handleView(e);
              } else if (item === "Send Test") {
                await handleSendTestNotification(e);
              } else if (item === "Activate/Deactivate") {
                await handleToggleStatus(e);
              } else if (item === "restore") {
                // Task restore action
                handleRestore(e);
              } else if (item === "link_objects") {
                handleLinkedObjects(e);
              } else if (item === "linked_policies") {
                handleOpenLinkedPolicies(e);
              } else if (item === "download_pdf") {
                await handleDownloadPDF(e);
              } else if (item === "download_docx") {
                await handleDownloadDOCX(e);
              } else if (item === "assign_folder") {
                if (onAssignToFolder) {
                  onAssignToFolder();
                }
                if (e) closeDropDownMenu(e);
              } else if (item === "preview") {
                if (e) closeDropDownMenu(e);
                if (onPreview) {
                  try {
                    await onPreview();
                  } catch (error) {
                    console.error("Preview failed:", error);
                  }
                }
              } else if (item === "edit_metadata") {
                if (e) closeDropDownMenu(e);
                if (onEditMetadata) {
                  try {
                    await onEditMetadata();
                  } catch (error) {
                    console.error("Edit metadata failed:", error);
                  }
                }
              } else if (item === "version_history") {
                if (onViewHistory) {
                  onViewHistory();
                }
                if (e) closeDropDownMenu(e);
              } else if (item === "delete" && (type === "Task" || type === "task")) {
                // Task hard delete action
                if (hardDeleteWarningTitle && hardDeleteWarningMessage) {
                  setIsOpenHardDeleteModal(true);
                  if (e) closeDropDownMenu(e);
                } else {
                  handleHardDelete(e);
                }
              } else if (item === "archive" && (type === "Task" || type === "task")) {
                // Task archive action (soft delete)
                if (warningTitle && warningMessage) {
                  setIsOpenRemoveModal(true);
                  if (e) closeDropDownMenu(e);
                } else {
                  handleDelete(e);
                }
              } else if (item === "remove" || item === "archive") {
                if (warningTitle && warningMessage) {
                  setIsOpenRemoveModal(true);
                  if (e) closeDropDownMenu(e);
                } else {
                  if (checkForRisks && onDeleteWithRisks) {
                    handleDeleteWithRiskCheck(e);
                  } else {
                    handleDelete(e);
                  }
                }
              }
            }}
            disabled={isDisabled}
            sx={{
              ...(() => {
                // Archive (soft delete) uses warning color
                if (item === "archive" && (type === "Task" || type === "task")) {
                  return { color: theme.palette.warning.main };
                }
                // Hard delete uses error color
                if (item === "delete" && (type === "Task" || type === "task")) {
                  return { color: theme.palette.error.main };
                }
                // Other remove/archive uses error color
                if (item === "remove" || item === "archive") {
                  return { color: theme.palette.error.main };
                }
                // Restore uses primary/success color
                if (item === "restore") {
                  return { color: theme.palette.primary.main };
                }
                if (item === "link_objects" || item === "linked_policies") {
                  return { color: theme.palette.primary.main };
                }
                return {};
              })(),
            }}
          >
            {getMenuItemText(item)}
          </MenuItem>
          </Tooltip>
        );
      })}
    </Menu>
  );

  const customIconButtonAsSettings: JSX.Element = (
    <MuiIconButton
      disableRipple={
        theme.components?.MuiIconButton?.defaultProps?.disableRipple
      }
      sx={singleTheme.iconButtons}
      onClick={(event) => {
        event.stopPropagation();
        openMenu(event, id, "someUrl");
      }}
    >
      <Settings size={20} />
    </MuiIconButton>
  );

  return (
    <>
      {customIconButtonAsSettings}
      {dropDownListOfOptions}
      {warningTitle && warningMessage && isOpenRemoveModal && (
        <ConfirmationModal
          isOpen={isOpenRemoveModal}
          title={warningTitle}
          body={
            typeof warningMessage === "string" ? (
              <Typography fontSize={13} color={theme.palette.text.primary}>
                {warningMessage}
              </Typography>
            ) : (
              warningMessage
            )
          }
          cancelText="Cancel"
          proceedText={
            type === "Incident" || type === "Task"
              ? `Archive ${type.toLowerCase()}`
              : `Delete ${type}`
          }
          onCancel={() => handleCancel()}
          onProceed={() =>
            checkForRisks && onDeleteWithRisks
              ? handleDeleteWithRiskCheck()
              : handleDelete()
          }
          proceedButtonColor={
            type === "Incident" || type === "Task" ? "warning" : "error"
          }
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}
      {hardDeleteWarningTitle && hardDeleteWarningMessage && isOpenHardDeleteModal && (
        <ConfirmationModal
          isOpen={isOpenHardDeleteModal}
          title={hardDeleteWarningTitle}
          body={
            typeof hardDeleteWarningMessage === "string" ? (
              <Typography fontSize={13} color={theme.palette.text.primary}>
                {hardDeleteWarningMessage}
              </Typography>
            ) : (
              hardDeleteWarningMessage
            )
          }
          cancelText="Cancel"
          proceedText="Delete permanently"
          onCancel={() => setIsOpenHardDeleteModal(false)}
          onProceed={() => handleHardDelete()}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}
      <ModelRiskConfirmation
        isOpen={isOpenRiskConfirmationModal}
        setIsOpen={setIsOpenRiskConfirmationModal}
        onConfirm={handleRiskConfirmation}
        onCancel={handleRiskConfirmationCancel}
      />
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}
    </>
  );
}

export default IconButton;
