import React, { useMemo, useCallback } from "react";
import CustomizablePolicyTable from "../Table/PolicyTable";
import { TableRow, TableCell } from "@mui/material";
import singleTheme from "../../themes/v1SingleTheme";
import CustomIconButton from "../../components/IconButton";
import useUsers from "../../../application/hooks/useUsers";
import { PolicyTableProps } from "../../types/interfaces/i.policy";
import Chip from "../Chip";
import { store } from "../../../application/redux/store";

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
}) => {
  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  const isVisible = useCallback(
    (key: string) => !visibleColumns || visibleColumns.size === 0 || visibleColumns.has(key),
    [visibleColumns]
  );

  const visibleTableHeaders = useMemo(
    () =>
      tableHeaders.filter(
        (col) => col.id === "title" || col.id === "actions" || isVisible(col.id)
      ),
    [isVisible]
  );

  // Helper function to get user name by ID
  const getUserNameById = (id: string | null | undefined | number) => {
    const user = users.find((u) => u.id === id);
    return user ? user.name + " " + user.surname : "-";
  };

  const { users } = useUsers();

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
    return (
      <div className="error-message">
        Error loading policies: {error.message}
      </div>
    );
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
      <CustomizablePolicyTable
        data={{ rows, cols: visibleTableHeaders }}
        paginated
        setSelectedRow={() => {}}
        setAnchorEl={() => {}}
        onRowClick={(id: string) => onOpen(Number(id))}
        hidePagination={hidePagination}
        flashRowId={flashRowId}
        renderRow={(policy, sortConfig) => (
          <TableRow
            key={policy.id}
            tabIndex={0}
            aria-label={`Policy: ${policy.title}`}
            sx={{
              ...singleTheme.tableStyles.primary.body.row,
              ...(flashRowId === policy.id && {
                backgroundColor: singleTheme.flashColors.background,
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
            <TableCell
              sx={{
                ...cellStyle,
                backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("title") ? singleTheme.tableColors.sortedColumnFirst : undefined,
              }}
            >
              {policy.title.length > 30
                ? `${policy.title.slice(0, 30)}...`
                : policy.title}
            </TableCell>
            {isVisible("status") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("status") ? singleTheme.tableColors.sortedColumn : undefined,
                }}
              >
                <Chip label={policy.status} />
              </TableCell>
            )}
            {isVisible("next_review") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor: sortConfig?.key && (sortConfig.key.toLowerCase().includes("next") || sortConfig.key.toLowerCase().includes("review")) ? singleTheme.tableColors.sortedColumn : undefined,
                }}
              >
                {policy.next_review_date
                  ? new Date(policy.next_review_date).toLocaleDateString()
                  : "-"}
              </TableCell>
            )}
            {isVisible("author") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("author") ? singleTheme.tableColors.sortedColumn : undefined,
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
                  backgroundColor: sortConfig?.key && (sortConfig.key.toLowerCase().includes("last") || sortConfig.key.toLowerCase().includes("updated")) && !sortConfig.key.toLowerCase().includes("by") ? singleTheme.tableColors.sortedColumn : undefined,
                }}
              >
                {policy.last_updated_at
                  ? new Date(policy.last_updated_at).toLocaleString()
                  : "-"}
              </TableCell>
            )}
            {isVisible("updated_by") && (
              <TableCell
                sx={{
                  ...cellStyle,
                  backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("updated") && sortConfig.key.toLowerCase().includes("by") ? singleTheme.tableColors.sortedColumn : undefined,
                }}
              >
                {getUserNameById(policy.last_updated_by)}
              </TableCell>
            )}
            <TableCell
              sx={{
                backgroundColor: sortConfig?.key && sortConfig.key.toLowerCase().includes("actions") ? singleTheme.tableColors.sortedColumn : undefined,
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
                  onAssignToFolder={onAssignToFolder ? () => onAssignToFolder(policy.id) : undefined}
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
    </>
  );
};

export default PolicyTable;
