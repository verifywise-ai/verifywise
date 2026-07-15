import React, { useMemo, useCallback, useState } from "react";
import CustomizablePolicyTable from "../Table/PolicyTable";
import { Box, Stack, TableRow, TableCell, Typography } from "@mui/material";
import VWSelect from "../Inputs/Select";
import CustomizableMultiSelect from "../Inputs/Select/Multi";
import { Archive, UserCheck, Tag as TagIcon } from "lucide-react";
import singleTheme from "../../themes/v1SingleTheme";
import CustomIconButton from "../../components/IconButton";
import useUsers from "../../../application/hooks/useUsers";
import { PolicyTableProps } from "../../types/interfaces/i.policy";
import Chip from "../Chip";
import Checkbox from "../Inputs/Checkbox";
import ConfirmationModal from "../Dialogs/ConfirmationModal";
import BulkActionsToolbar, { type BulkAction } from "../Table/BulkActionsToolbar";
import { useBulkSelection } from "../../../application/hooks/useBulkSelection";
import { useBulkUpdatePolicies } from "../../../application/hooks/useBulkUpdatePolicies";
import { POLICY_TAGS } from "../../../domain/models/Common/policy/policyManager.model";
import { store } from "../../../application/redux/store";
import { useCustomFieldDefinitions } from "../../../application/hooks/useCustomFields";
import { formatCustomFieldValue } from "../CustomFieldsSection/formatCustomFieldValue";
import { displayFormattedDate, displayFormattedDateTime } from "../../tools/isoDateToString";

const tableHeaders = [
  { id: "title", name: "Title" },
  { id: "status", name: "Status" },
  { id: "next_review", name: "Next Review" },
  { id: "author", name: "Author" },
  // { id: "reviewers", name: "Reviewers" },
  { id: "last_updated", name: "Last Updated" },
  { id: "updated_by", name: "Updated By" },
  { id: "actions", name: "Actions" },
];

const PolicyTable: React.FC<PolicyTableProps> = ({
  data,
  onOpen,
  onDelete,
  onLinkedObjects,
  onAssignToFolder,
  isLoading,
  error,
  onRefresh,
  hidePagination = false,
  flashRowId,
  visibleColumns,
  canRunBulkActions = false,
  onBulkActionSuccess,
}) => {
  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  const isVisible = useCallback(
    (key: string) => !visibleColumns || visibleColumns.size === 0 || visibleColumns.has(key),
    [visibleColumns],
  );

  const { data: customFieldDefs = [] } = useCustomFieldDefinitions("policy");

  const visibleTableHeaders = useMemo(() => {
    const builtIns = tableHeaders.filter(
      (col) => col.id === "title" || col.id === "actions" || isVisible(col.id),
    );
    const customCols = customFieldDefs.map((d) => ({
      id: `cf_${d.id}`,
      name: d.label,
    }));
    const actionsIdx = builtIns.findIndex((c) => c.id === "actions");
    if (actionsIdx === -1) return [...builtIns, ...customCols];
    return [...builtIns.slice(0, actionsIdx), ...customCols, ...builtIns.slice(actionsIdx)];
  }, [isVisible, customFieldDefs]);

  const { users } = useUsers();

  // Helper function to get user name by ID
  const getUserNameById = (id: string | null | undefined | number) => {
    const user = users.find((u) => u.id === id);
    return user ? user.name + " " + user.surname : "-";
  };

  // ----- Bulk actions -----
  const getRowId = useCallback((p: any) => Number(p.id), []);
  const {
    selectedIds,
    isSelected,
    toggle: toggleSelection,
    toggleAll,
    setAll: setAllSelected,
    clear: clearSelection,
    allSelected,
    someSelected,
    count: selectionCount,
  } = useBulkSelection<any>({ rows: data, getId: getRowId });

  const [reviewerDialogOpen, setReviewerDialogOpen] = useState(false);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [pendingReviewerId, setPendingReviewerId] = useState<string>("");
  const [pendingTags, setPendingTags] = useState<string[]>([]);

  const bulkMutation = useBulkUpdatePolicies({
    onSuccess: (payload) => {
      clearSelection();
      setReviewerDialogOpen(false);
      setTagsDialogOpen(false);
      setPendingReviewerId("");
      setPendingTags([]);
      onBulkActionSuccess?.(payload.action, payload.ids.length);
    },
  });

  const handleConfirmArchive = useCallback(() => {
    if (selectedIds.length === 0) return;
    bulkMutation.mutate({ ids: selectedIds, action: "archive" });
  }, [bulkMutation, selectedIds]);

  const handleConfirmReviewer = useCallback(() => {
    if (!pendingReviewerId || selectedIds.length === 0) return;
    bulkMutation.mutate({
      ids: selectedIds,
      action: "set_reviewer",
      reviewerId: Number(pendingReviewerId),
    });
  }, [bulkMutation, pendingReviewerId, selectedIds]);

  const handleConfirmTags = useCallback(() => {
    if (selectedIds.length === 0) return;
    bulkMutation.mutate({
      ids: selectedIds,
      action: "set_tags",
      tags: pendingTags,
    });
  }, [bulkMutation, pendingTags, selectedIds]);

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        id: "archive",
        label: "Archive",
        icon: <Archive size={16} />,
        onClick: handleConfirmArchive,
        disabled: bulkMutation.isPending,
        confirm: {
          title: `Archive ${selectionCount} polic${selectionCount === 1 ? "y" : "ies"}?`,
          body: "Archived policies will be moved out of the active list. You can still find them via the Archived status filter.",
          confirmLabel: "Archive",
          danger: true,
        },
      },
      {
        id: "set_reviewer",
        label: "Assign reviewer",
        icon: <UserCheck size={16} />,
        onClick: () => {
          setPendingReviewerId("");
          setReviewerDialogOpen(true);
        },
        disabled: bulkMutation.isPending,
      },
      {
        id: "set_tags",
        label: "Set tags",
        icon: <TagIcon size={16} />,
        onClick: () => {
          setPendingTags([]);
          setTagsDialogOpen(true);
        },
        disabled: bulkMutation.isPending,
      },
    ],
    [handleConfirmArchive, bulkMutation.isPending, selectionCount],
  );

  // Download handlers for policy export
  const handleDownloadPDF = async (policyId: number, title: string) => {
    try {
      const token = store.getState().auth.authToken;
      const response = await fetch(`/api/policies/${policyId}/export/pdf`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to export PDF");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `${title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export PDF:", error);
    }
  };

  const handleDownloadDOCX = async (policyId: number, title: string) => {
    try {
      const token = store.getState().auth.authToken;
      const response = await fetch(`/api/policies/${policyId}/export/docx`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to export DOCX");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `${title.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.docx`;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export DOCX:", error);
    }
  };

  if (error) {
    return <div className="error-message">Error loading policies: {error.message}</div>;
  }

  if (isLoading) {
    return <div className="loading-indicator">Loading policies...</div>;
  }

  if (data.length === 0) {
    return <div className="empty-state">No policies found</div>;
  }

  const rows = data.map((policy) => ({
    ...policy,
    id: policy.id, // needed for row key
  }));

  return (
    <>
      {canRunBulkActions && (
        <BulkActionsToolbar
          count={selectionCount}
          onClear={clearSelection}
          actions={bulkActions}
          selectAll={{
            totalCount: data.length,
            onSelectAll: () => setAllSelected(data.map((p) => Number(p.id))),
          }}
        />
      )}
      <CustomizablePolicyTable
        data={{ rows, cols: visibleTableHeaders }}
        paginated
        setSelectedRow={() => {}}
        setAnchorEl={() => {}}
        onRowClick={(id: string) => onOpen(Number(id))}
        hidePagination={hidePagination}
        flashRowId={flashRowId}
        selection={
          canRunBulkActions
            ? {
                allSelected: allSelected && rows.length > 0,
                someSelected,
                onToggleAll: toggleAll,
              }
            : undefined
        }
        renderRow={(policy, sortConfig) => (
          <TableRow
            key={policy.id}
            tabIndex={0}
            aria-label={`Policy: ${policy.title}`}
            sx={{
              ...singleTheme.tableStyles.primary.body.row,
              ...(flashRowId === policy.id && {
                "backgroundColor": singleTheme.flashColors.background,
                "& td": {
                  backgroundColor: "transparent !important",
                },
                "&:hover": {
                  backgroundColor: singleTheme.flashColors.backgroundHover,
                },
              }),
            }}
            onClick={(_event) => {
              const target = _event.target as HTMLElement;

              // Prevent triggering onOpen when clicking within any modal or dialog
              if (
                target.closest("button") ||
                target.closest(".MuiDialog-root") || // MUI Dialog
                target.closest("[role='dialog']") || // General dialogs
                target.closest(".modal") // Any custom modal class
              ) {
                return;
              }

              onOpen(policy.id);
            }}
          >
            {canRunBulkActions && (
              <TableCell
                padding="checkbox"
                sx={{
                  width: 40,
                  minWidth: 40,
                  maxWidth: 40,
                  padding: 0,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  <Checkbox
                    id={`policy-row-checkbox-${policy.id}`}
                    value={String(policy.id)}
                    isChecked={isSelected(Number(policy.id))}
                    onChange={() => toggleSelection(Number(policy.id))}
                    ariaLabel={`Select policy ${policy.title}`}
                    size="small"
                    sx={{ p: 0 }}
                  />
                </Box>
              </TableCell>
            )}
            <TableCell
              sx={{
                ...cellStyle,
                backgroundColor:
                  sortConfig?.key && sortConfig.key.toLowerCase().includes("title")
                    ? singleTheme.tableColors.sortedColumnFirst
                    : undefined,
              }}
            >
              {policy.title.length > 30 ? `${policy.title.slice(0, 30)}...` : policy.title}
            </TableCell>
            {isVisible("status") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor:
                    sortConfig?.key && sortConfig.key.toLowerCase().includes("status")
                      ? singleTheme.tableColors.sortedColumn
                      : undefined,
                }}
              >
                <Chip label={policy.status} />
              </TableCell>
            )}
            {isVisible("next_review") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor:
                    sortConfig?.key &&
                    (sortConfig.key.toLowerCase().includes("next") ||
                      sortConfig.key.toLowerCase().includes("review"))
                      ? singleTheme.tableColors.sortedColumn
                      : undefined,
                }}
              >
                {policy.next_review_date ? displayFormattedDate(policy.next_review_date) : "-"}
              </TableCell>
            )}
            {isVisible("author") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor:
                    sortConfig?.key && sortConfig.key.toLowerCase().includes("author")
                      ? singleTheme.tableColors.sortedColumn
                      : undefined,
                }}
              >
                {getUserNameById(policy.author_id)}
              </TableCell>
            )}
            {/* <TableCell sx={cellStyle}>
              {
                policy.assigned_reviewer_ids?.map(getUserNameById).join(", ").length > 30 ? `${policy.assigned_reviewer_ids?.map(getUserNameById).join(", ").slice(0, 30)}...` : policy.assigned_reviewer_ids?.map(getUserNameById).join(", ") || "-"
              }
            </TableCell> */}
            {isVisible("last_updated") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor:
                    sortConfig?.key &&
                    (sortConfig.key.toLowerCase().includes("last") ||
                      sortConfig.key.toLowerCase().includes("updated")) &&
                    !sortConfig.key.toLowerCase().includes("by")
                      ? singleTheme.tableColors.sortedColumn
                      : undefined,
                }}
              >
                {policy.last_updated_at ? displayFormattedDateTime(policy.last_updated_at) : "-"}
              </TableCell>
            )}
            {isVisible("updated_by") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor:
                    sortConfig?.key &&
                    sortConfig.key.toLowerCase().includes("updated") &&
                    sortConfig.key.toLowerCase().includes("by")
                      ? singleTheme.tableColors.sortedColumn
                      : undefined,
                }}
              >
                {getUserNameById(policy.last_updated_by)}
              </TableCell>
            )}
            {customFieldDefs.map((def) => {
              const match = (policy as any).custom_fields?.find(
                (cf: { definition_id: number; value: unknown }) => cf.definition_id === def.id,
              );
              return (
                <TableCell key={`cf_${def.id}`} sx={cellStyle}>
                  {formatCustomFieldValue(def, match?.value, users)}
                </TableCell>
              );
            })}
            <TableCell
              sx={{
                backgroundColor:
                  sortConfig?.key && sortConfig.key.toLowerCase().includes("actions")
                    ? singleTheme.tableColors.sortedColumn
                    : undefined,
              }}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <CustomIconButton
                  id={Number(policy.id)}
                  onDelete={() => {
                    onDelete(policy.id);
                    onRefresh?.();
                  }}
                  onEdit={() => {
                    onOpen(policy.id);
                  }}
                  onLinkedObjects={() => {
                    onLinkedObjects(policy.id);
                  }}
                  onAssignToFolder={
                    onAssignToFolder ? () => onAssignToFolder(policy.id) : undefined
                  }
                  onDownloadPDF={() => handleDownloadPDF(policy.id, policy.title)}
                  onDownloadDOCX={() => handleDownloadDOCX(policy.id, policy.title)}
                  onMouseEvent={() => {}}
                  warningTitle="Delete this policy?"
                  warningMessage="When you delete this policy, all data related to it will be removed. This action is non-recoverable."
                  type="Policy"
                />
              </div>
            </TableCell>
          </TableRow>
        )}
      />

      {canRunBulkActions && reviewerDialogOpen && (
        <ConfirmationModal
          isOpen
          title={`Assign reviewer to ${selectionCount} polic${selectionCount === 1 ? "y" : "ies"}`}
          body={
            <Stack gap={2}>
              <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
                Replaces existing reviewer assignments.
              </Typography>
              <VWSelect
                id="bulk-policy-reviewer"
                placeholder="Choose a reviewer…"
                value={pendingReviewerId}
                onChange={(e) => setPendingReviewerId(String(e.target.value))}
                items={users.map((u) => ({
                  _id: String(u.id),
                  name: u.name,
                  surname: u.surname,
                }))}
                sx={{ width: 280 }}
              />
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Assign"
          proceedButtonVariant="contained"
          confirmBtnSx={{
            opacity: pendingReviewerId ? 1 : 0.5,
            pointerEvents: pendingReviewerId ? "auto" : "none",
          }}
          onCancel={() => {
            if (bulkMutation.isPending) return;
            setReviewerDialogOpen(false);
          }}
          onProceed={handleConfirmReviewer}
          isLoading={bulkMutation.isPending}
        />
      )}

      {canRunBulkActions && tagsDialogOpen && (
        <ConfirmationModal
          isOpen
          title={`Set tags on ${selectionCount} polic${selectionCount === 1 ? "y" : "ies"}`}
          body={
            <Stack gap={2}>
              <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
                Replaces existing tags. Leave empty to clear.
              </Typography>
              <CustomizableMultiSelect
                label=""
                placeholder="Choose tags…"
                isHidden
                value={pendingTags}
                onChange={(e) => {
                  const v = e.target.value;
                  setPendingTags(
                    typeof v === "string" ? v.split(",") : (v as (string | number)[]).map(String),
                  );
                }}
                items={POLICY_TAGS.map((t: string) => ({ _id: t, name: t }))}
                width={320}
              />
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Apply"
          proceedButtonVariant="contained"
          onCancel={() => {
            if (bulkMutation.isPending) return;
            setTagsDialogOpen(false);
          }}
          onProceed={handleConfirmTags}
          isLoading={bulkMutation.isPending}
        />
      )}
    </>
  );
};

export default PolicyTable;
