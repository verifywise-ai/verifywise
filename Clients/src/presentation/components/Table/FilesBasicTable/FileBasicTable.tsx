/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  useTheme,
  Typography,
} from "@mui/material";
import VWSelect from "../../Inputs/Select";
import CustomizableMultiSelect from "../../Inputs/Select/Multi";
import TablePaginationActions from "../../TablePagination";
import singleTheme from "../../../themes/v1SingleTheme";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronsUpDown, ChevronUp, ChevronDown, FolderInput, Tag as TagIcon } from "lucide-react";
import IconButton from "../../IconButton";
import { FileIcon } from "../../FileIcon";
import Chip from "../../Chip";
import Checkbox from "../../Inputs/Checkbox";
import ChipInput from "../../Inputs/ChipInput";
import ConfirmationModal from "../../Dialogs/ConfirmationModal";
import BulkActionsToolbar, { type BulkAction } from "../BulkActionsToolbar";
import { handleDownload } from "../../../../application/tools/fileDownload";
import { deleteFileFromManager } from "../../../../application/repository/file.repository";
import { FileModel } from "../../../../domain/models/Common/file/file.model";
import {
  getPaginationRowCount,
  setPaginationRowCount,
} from "../../../../application/utils/paginationStorage";
import { IFileBasicTableProps } from "../../../types/interfaces/i.table";
import { deleteEntityById } from "../../../../application/repository/entity.repository";
import ProjectRiskLinkedPolicies from "../../ProjectRiskMitigation/ProjectRiskLinkedPolicies";
import { useBulkSelection } from "../../../../application/hooks/useBulkSelection";
import { useBulkUpdateFiles } from "../../../../application/hooks/useBulkUpdateFiles";
import { getAllFolders } from "../../../../application/repository/virtualFolder.repository";
import type { IFolderWithCount } from "../../../../domain/interfaces/i.virtualFolder";

const DEFAULT_ROWS_PER_PAGE = 10;
const FILES_BASIC_SORTING_KEY = "verifywise_files_basic_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const navigateToNewTab = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer");
};

/**
 * Truncate a filename in the middle so the extension stays visible.
 * e.g. "very-long-document-name-here.pdf" → "very-long-documen(...)e-here.pdf"
 */
const truncateFileName = (name: string, maxLength = 40): string => {
  if (!name || name.length <= maxLength) return name;
  const extIndex = name.lastIndexOf(".");
  const ext = extIndex > 0 ? name.slice(extIndex) : "";
  const baseName = extIndex > 0 ? name.slice(0, extIndex) : name;
  const availableChars = maxLength - ext.length - 5; // 5 for "(...)""
  if (availableChars <= 0) return name.slice(0, maxLength - 5) + "(...)" + ext;
  const frontChars = Math.ceil(availableChars * 0.6);
  const backChars = availableChars - frontChars;
  return baseName.slice(0, frontChars) + "(...)" + baseName.slice(-backChars) + ext;
};

// Helper function to match column name with sort key
const getSortMatchForColumn = (columnName: string, sortConfig?: SortConfig): boolean => {
  if (!sortConfig?.key || !columnName) return false;

  const sortKey = sortConfig.key.toLowerCase().trim();
  const colName = columnName.toString().toLowerCase().trim();

  // Handle flexible matching for different column name patterns
  return (
    sortKey === colName ||
    (sortKey.includes("file") && colName.includes("name")) ||
    (sortKey.includes("project") && colName.includes("project")) ||
    ((sortKey.includes("date") || sortKey.includes("upload")) &&
      (colName.includes("date") || colName.includes("upload"))) ||
    ((sortKey.includes("uploader") || sortKey.includes("user")) &&
      (colName.includes("uploader") || colName.includes("user"))) ||
    ((sortKey.includes("source") || sortKey.includes("type")) &&
      (colName.includes("source") || colName.includes("type"))) ||
    (sortKey.includes("version") && colName.includes("version")) ||
    (sortKey.includes("status") && colName.includes("status"))
  );
};

// Sortable Table Header Component
const SortableTableHead: React.FC<{
  columns: any[];
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
  selection?: {
    allSelected: boolean;
    someSelected: boolean;
    onToggleAll: () => void;
  };
}> = ({ columns, sortConfig, onSort, selection }) => {
  const theme = useTheme();

  return (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {selection && (
          <TableCell
            sx={{
              width: 40,
              minWidth: 40,
              maxWidth: 40,
              padding: 0,
              borderBottom: "1px solid #d0d5dd",
            }}
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
                id="file-table-select-all"
                value="select-all"
                isChecked={selection.allSelected}
                isIndeterminate={selection.someSelected && !selection.allSelected}
                onChange={selection.onToggleAll}
                ariaLabel="Select all files on this page"
                size="small"
                sx={{ p: 0 }}
              />
            </Box>
          </TableCell>
        )}
        {columns.map((col, index) => {
          const isLastColumn = index === columns.length - 1;
          const columnName = col.name.toString().toLowerCase();
          const sortable = !["actions", "action"].includes(columnName);

          return (
            <TableCell
              key={col.id}
              style={{
                ...singleTheme.tableStyles.primary.header.cell,
                ...col.sx,
                ...(!isLastColumn && sortable
                  ? {
                      "cursor": "pointer",
                      "userSelect": "none",
                      "&:hover": {
                        backgroundColor: "rgba(0, 0, 0, 0.04)",
                      },
                    }
                  : {}),
              }}
              onClick={() => sortable && onSort(col.name)}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: theme.spacing(2),
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    color: sortConfig.key === col.name ? "primary.main" : "inherit",
                    textTransform: "uppercase",
                  }}
                >
                  {col.name.toString()}
                </Typography>
                {sortable && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: sortConfig.key === col.name ? "primary.main" : "text.disabled",
                    }}
                  >
                    {sortConfig.key === col.name && sortConfig.direction === "asc" && (
                      <ChevronUp size={16} />
                    )}
                    {sortConfig.key === col.name && sortConfig.direction === "desc" && (
                      <ChevronDown size={16} />
                    )}
                    {sortConfig.key !== col.name && <ChevronsUpDown size={16} />}
                  </Box>
                )}
              </Box>
            </TableCell>
          );
        })}
      </TableRow>
    </TableHead>
  );
};

// Default visible columns (all columns)
const ALL_COLUMN_KEYS = [
  "file",
  "upload_date",
  "uploader",
  "source",
  "version",
  "status",
  "action",
] as const;

const FileBasicTable: React.FC<IFileBasicTableProps> = ({
  data,
  bodyData,
  paginated = false,
  table,
  onFileDeleted,
  hidePagination = false,
  onAssignToFolder,
  onPreview,
  onEditMetadata,
  onViewHistory,
  visibleColumnKeys = ALL_COLUMN_KEYS as unknown as string[],
  canRunBulkActions = false,
  onBulkActionSuccess,
}) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() =>
    getPaginationRowCount("evidences", DEFAULT_ROWS_PER_PAGE),
  );

  const [showLinkedPoliciesToEvidence, setShowLinkedPoliciesToEvidence] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<number | null>(null);

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(FILES_BASIC_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(FILES_BASIC_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  useEffect(() => setPage(0), [data]);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPaginationRowCount("evidences", newRowsPerPage);
    setPage(0);
  }, []);

  // Sorting handlers
  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prevConfig) => {
      if (prevConfig.key === columnId) {
        // Toggle direction if same column, or clear if already descending
        if (prevConfig.direction === "asc") {
          return { key: columnId, direction: "desc" };
        } else if (prevConfig.direction === "desc") {
          return { key: "", direction: null };
        }
      }
      // New column or first sort
      return { key: columnId, direction: "asc" };
    });
  }, []);

  // Sort the bodyData based on current sort configuration
  const sortedBodyData = useMemo(() => {
    if (!bodyData || !sortConfig.key || !sortConfig.direction) {
      return bodyData || [];
    }

    const sortableData = [...bodyData];

    return sortableData.sort((a: any, b: any) => {
      let aValue: string | number;
      let bValue: string | number;

      // Use exact column name matching - case insensitive
      const sortKey = sortConfig.key.trim().toLowerCase();

      // Handle different column types for files
      if (sortKey.includes("file") || sortKey.includes("name")) {
        aValue = a.fileName?.toLowerCase() || "";
        bValue = b.fileName?.toLowerCase() || "";
      } else if (sortKey.includes("project")) {
        aValue = a.projectTitle?.toLowerCase() || "";
        bValue = b.projectTitle?.toLowerCase() || "";
      } else if (sortKey.includes("date") || sortKey.includes("upload")) {
        aValue = new Date(a.uploadDate).getTime();
        bValue = new Date(b.uploadDate).getTime();
      } else if (sortKey.includes("uploader") || sortKey.includes("user")) {
        aValue = a.uploader?.toLowerCase() || "";
        bValue = b.uploader?.toLowerCase() || "";
      } else if (sortKey.includes("source") || sortKey.includes("type")) {
        aValue = a.source?.toLowerCase() || "";
        bValue = b.source?.toLowerCase() || "";
      } else if (sortKey.includes("version")) {
        aValue = (a as any).version?.toLowerCase() || "";
        bValue = (b as any).version?.toLowerCase() || "";
      } else if (sortKey.includes("status")) {
        aValue = (a as any).reviewStatus?.toLowerCase() || "";
        bValue = (b as any).reviewStatus?.toLowerCase() || "";
      } else {
        // Try to handle unknown columns by checking if they're properties of the row
        if (sortKey && sortKey in a && sortKey in b) {
          const aVal = (a as Record<string, unknown>)[sortKey];
          const bVal = (b as Record<string, unknown>)[sortKey];
          aValue = String(aVal).toLowerCase();
          bValue = String(bVal).toLowerCase();
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === "asc" ? comparison : -comparison;
        }
        return 0;
      }

      // Handle string comparisons
      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortConfig.direction === "asc" ? comparison : -comparison;
      }

      // Handle number comparisons
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [bodyData, sortConfig]);

  const paginatedRows = hidePagination
    ? sortedBodyData
    : sortedBodyData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // ----- Bulk actions -----
  const getRowId = useCallback((file: FileModel) => Number(file.id), []);
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
  } = useBulkSelection<FileModel>({ rows: paginatedRows, getId: getRowId });

  // Full filtered/sorted set across all pages (for the toolbar's "Select all N").
  const allSelectableFileIds = useMemo(
    () => sortedBodyData.map((f) => Number(f.id)),
    [sortedBodyData],
  );

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<"set" | "add" | "remove">("add");
  const [folders, setFolders] = useState<IFolderWithCount[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  const bulkMutation = useBulkUpdateFiles({
    onSuccess: (action) => {
      clearSelection();
      if (action.type === "move_to_folder") {
        setFolderDialogOpen(false);
        setSelectedFolderId("");
        onBulkActionSuccess?.({
          type: "move_to_folder",
          folderId: action.folderId,
          count: action.ids.length,
        });
      } else {
        setTagsDialogOpen(false);
        setPendingTags([]);
        onBulkActionSuccess?.({
          type: "update_tags",
          mode: action.payload.mode,
          count: action.payload.ids.length,
        });
      }
    },
  });

  const handleOpenFolderDialog = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setSelectedFolderId("");
    setFolderDialogOpen(true);
    if (folders.length === 0 && !foldersLoading) {
      try {
        setFoldersLoading(true);
        const list = await getAllFolders();
        setFolders(list);
      } catch (err) {
        console.error("Failed to load folders", err);
      } finally {
        setFoldersLoading(false);
      }
    }
  }, [selectedIds.length, folders.length, foldersLoading]);

  const handleConfirmMoveToFolder = useCallback(() => {
    if (!selectedFolderId || selectedIds.length === 0) return;
    bulkMutation.mutate({
      type: "move_to_folder",
      folderId: Number(selectedFolderId),
      ids: selectedIds,
    });
  }, [bulkMutation, selectedFolderId, selectedIds]);

  const selectedFilesTags = useMemo(() => {
    if (selectedIds.length === 0) return [] as string[];
    const set = new Set<string>();
    for (const f of bodyData) {
      if (selectedIds.includes(Number(f.id))) {
        const tags = (f as any).tags as string[] | undefined;
        tags?.forEach((t) => {
          if (typeof t === "string" && t.length > 0) set.add(t);
        });
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bodyData, selectedIds]);

  // Snapshot the tag union when the dialog opens so it doesn't shift as the
  // mutation in flight refreshes bodyData under us.
  const [dialogTagsSnapshot, setDialogTagsSnapshot] = useState<string[]>([]);

  const handleOpenTagsDialog = useCallback(() => {
    if (selectedIds.length === 0) return;
    setDialogTagsSnapshot(selectedFilesTags);
    setTagMode("add");
    setPendingTags([]);
    setTagsDialogOpen(true);
  }, [selectedIds.length, selectedFilesTags]);

  // Switch modes and reset pendingTags atomically. "set" starts from the
  // current tag union; "add" and "remove" start empty — the user is
  // entering a *delta* in those modes, not the existing state.
  const handleTagModeChange = useCallback(
    (next: "set" | "add" | "remove") => {
      setTagMode(next);
      setPendingTags(next === "set" ? dialogTagsSnapshot : []);
    },
    [dialogTagsSnapshot],
  );

  const handleConfirmTags = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (tagMode !== "set" && pendingTags.length === 0) return;
    bulkMutation.mutate({
      type: "update_tags",
      payload: {
        ids: selectedIds,
        tags: pendingTags,
        mode: tagMode,
      },
    });
  }, [bulkMutation, pendingTags, selectedIds, tagMode]);

  const bulkActions = useMemo<BulkAction[]>(
    () => [
      {
        id: "move_to_folder",
        label: "Move to folder",
        icon: <FolderInput size={16} />,
        onClick: handleOpenFolderDialog,
        disabled: bulkMutation.isPending,
      },
      {
        id: "edit_tags",
        label: "Edit tags",
        icon: <TagIcon size={16} />,
        onClick: handleOpenTagsDialog,
        disabled: bulkMutation.isPending,
      },
    ],
    [handleOpenFolderDialog, handleOpenTagsDialog, bulkMutation.isPending],
  );

  const handleRowClick = (item: FileModel, event: React.MouseEvent) => {
    event.stopPropagation();
    switch (item.source) {
      case "Assessment tracker group":
        navigateToNewTab(
          `/project-view?projectId=${item.projectId}&tab=frameworks&framework=eu-ai-act&topicId=${item.parentId}&questionId=${item.metaId}`,
        );
        break;
      case "Compliance tracker group":
        navigateToNewTab(
          `/project-view?projectId=${item.projectId}&tab=frameworks&framework=eu-ai-act&controlId=${item.parentId}&subControlId=${item.metaId}&isEvidence=${item.isEvidence}`,
        );
        break;
      case "Management system clauses group":
        navigateToNewTab(
          `/framework?frameworkName=iso-42001&clauseId=${item.parentId}&subClauseId=${item.metaId}`,
        );
        break;
      case "Main clauses group":
        navigateToNewTab(
          `/framework?frameworkName=iso-27001&clause27001Id=${item.parentId}&subClause27001Id=${item.metaId}`,
        );
        break;
      case "Reference controls group":
        navigateToNewTab(
          `/framework?frameworkName=iso-42001&annexId=${item.parentId}&annexCategoryId=${item.metaId}`,
        );
        break;
      case "Annex controls group":
        navigateToNewTab(
          `/framework?frameworkName=iso-27001&annex27001Id=${item.parentId}&annexControl27001Id=${item.metaId}`,
        );
        break;
      default:
        console.warn("Unknown source type:", item.source);
    }
  };

  // Create delete handler for a specific file
  // Returns true on success, false on error (for IconButton loading state)
  const createDeleteHandler = useCallback(
    (fileId: string) => async (): Promise<boolean> => {
      try {
        await deleteFileFromManager({ id: fileId });
        onFileDeleted?.(fileId);
        // Unlink from policies (fire and forget)
        deleteEntityById({
          routeUrl: `/policy-linked/evidence/${fileId}/unlink-all`,
        }).catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
    [onFileDeleted],
  );

  const handleViewLinkedPolicies = async (evidenceId: number) => {
    setSelectedEvidenceId(evidenceId);
    setShowLinkedPoliciesToEvidence(true);
  };

  return (
    <>
      {canRunBulkActions && (
        <BulkActionsToolbar
          count={selectionCount}
          onClear={clearSelection}
          actions={bulkActions}
          selectAll={{
            totalCount: allSelectableFileIds.length,
            onSelectAll: () => setAllSelected(allSelectableFileIds),
          }}
        />
      )}
      <TableContainer id={table}>
        <Table sx={singleTheme.tableStyles.primary.frame}>
          <SortableTableHead
            columns={data.cols}
            sortConfig={sortConfig}
            onSort={handleSort}
            selection={
              canRunBulkActions
                ? {
                    allSelected: allSelected && paginatedRows.length > 0,
                    someSelected,
                    onToggleAll: toggleAll,
                  }
                : undefined
            }
          />
          <TableBody>
            {paginatedRows.map((row) => {
              // Track column index for sort highlighting (only visible columns)
              let colIndex = 0;
              return (
                <TableRow
                  key={`${row.id}-${row.fileName}`}
                  sx={{
                    ...singleTheme.tableStyles.primary.body.row,
                    "&:hover": { backgroundColor: "background.surface" },
                  }}
                >
                  {canRunBulkActions && (
                    <TableCell
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
                          id={`file-row-checkbox-${row.id}`}
                          value={String(row.id)}
                          isChecked={isSelected(Number(row.id))}
                          onChange={() => toggleSelection(Number(row.id))}
                          ariaLabel={`Select file ${row.fileName}`}
                          size="small"
                          sx={{ p: 0 }}
                        />
                      </Box>
                    </TableCell>
                  )}
                  {/* File column */}
                  {visibleColumnKeys.includes("file") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        backgroundColor: getSortMatchForColumn(
                          data.cols[colIndex++]?.name,
                          sortConfig,
                        )
                          ? "#e8e8e8"
                          : "#fafafa",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          maxWidth: "360px",
                        }}
                        title={row.fileName}
                      >
                        <FileIcon fileName={row.fileName} />
                        <span style={{ whiteSpace: "nowrap" }}>
                          {truncateFileName(row.fileName)}
                        </span>
                      </Box>
                    </TableCell>
                  )}
                  {/* Upload Date column */}
                  {visibleColumnKeys.includes("upload_date") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        backgroundColor: getSortMatchForColumn(
                          data.cols[colIndex++]?.name,
                          sortConfig,
                        )
                          ? "background.surface"
                          : "inherit",
                      }}
                    >
                      {row.getFormattedUploadDate()}
                    </TableCell>
                  )}
                  {/* Uploader column */}
                  {visibleColumnKeys.includes("uploader") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        backgroundColor: getSortMatchForColumn(
                          data.cols[colIndex++]?.name,
                          sortConfig,
                        )
                          ? "background.surface"
                          : "inherit",
                      }}
                    >
                      {row.uploaderName || row.uploader}
                    </TableCell>
                  )}
                  {/* Source column */}
                  {visibleColumnKeys.includes("source") &&
                    (() => {
                      const isLinked = [
                        "Assessment tracker group",
                        "Compliance tracker group",
                        "Management system clauses group",
                        "Main clauses group",
                        "Reference controls group",
                        "Annex controls group",
                      ].includes(row.source || "");
                      return (
                        <TableCell
                          sx={{
                            ...singleTheme.tableStyles.primary.body.cell,
                            backgroundColor: getSortMatchForColumn(
                              data.cols[colIndex++]?.name,
                              sortConfig,
                            )
                              ? "background.surface"
                              : "inherit",
                          }}
                        >
                          {isLinked ? (
                            <Box
                              sx={{
                                "display": "flex",
                                "alignItems": "flex-end",
                                "gap": "4px",
                                "textDecoration": "underline",
                                "& svg": { visibility: "hidden" },
                                "&:hover": {
                                  "cursor": "pointer",
                                  "& svg": { visibility: "visible" },
                                },
                              }}
                              onClick={(event) => handleRowClick(row, event)}
                            >
                              {row.source === "Compliance tracker group"
                                ? "Requirements tracker group"
                                : row.source === "Assessment tracker group"
                                  ? "Controls tracker group"
                                  : row.source}
                            </Box>
                          ) : (
                            <Typography variant="body2" sx={{ color: "text.muted", fontSize: 13 }}>
                              Not linked
                            </Typography>
                          )}
                        </TableCell>
                      );
                    })()}
                  {/* Version column */}
                  {visibleColumnKeys.includes("version") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        backgroundColor: getSortMatchForColumn(
                          data.cols[colIndex++]?.name,
                          sortConfig,
                        )
                          ? "background.surface"
                          : "inherit",
                      }}
                    >
                      <Chip
                        label={`v${(row as any).version || "1.0"}`}
                        variant={
                          (row as any).reviewStatus === "approved"
                            ? "success"
                            : (row as any).reviewStatus === "superseded"
                              ? "default"
                              : "info"
                        }
                        uppercase={false}
                      />
                    </TableCell>
                  )}
                  {/* Status column */}
                  {visibleColumnKeys.includes("status") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        backgroundColor: getSortMatchForColumn(
                          data.cols[colIndex++]?.name,
                          sortConfig,
                        )
                          ? "background.surface"
                          : "inherit",
                      }}
                    >
                      <Chip
                        label={((row as any).reviewStatus || "draft")
                          .replace(/_/g, " ")
                          .replace(/^\w/, (c: string) => c.toUpperCase())}
                        uppercase={false}
                      />
                    </TableCell>
                  )}
                  {/* Action column */}
                  {visibleColumnKeys.includes("action") && (
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        minWidth: "50px",
                        backgroundColor: getSortMatchForColumn(
                          data.cols[data.cols.length - 1]?.name,
                          sortConfig,
                        )
                          ? "background.surface"
                          : "inherit",
                      }}
                    >
                      <IconButton
                        id={Number(row.id)}
                        type="report"
                        onEdit={() => {}}
                        onDownload={() => handleDownload(row.id, row.fileName)}
                        onDelete={createDeleteHandler(row.id)}
                        openLinkedPolicies={() => handleViewLinkedPolicies(Number(row.id!))}
                        onAssignToFolder={
                          onAssignToFolder ? () => onAssignToFolder(Number(row.id)) : undefined
                        }
                        onPreview={onPreview ? () => onPreview(row.id) : undefined}
                        onEditMetadata={onEditMetadata ? () => onEditMetadata(row.id) : undefined}
                        onViewHistory={onViewHistory ? () => onViewHistory(row.id) : undefined}
                        warningTitle="Delete this file?"
                        warningMessage="When you delete this file, it will be permanently removed from the system. This action cannot be undone."
                        onMouseEvent={() => {}}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
          {paginated && (
            <TableFooter>
              <TableRow
                sx={{
                  "& .MuiTableCell-root.MuiTableCell-footer": {
                    paddingX: theme.spacing(8),
                    paddingY: theme.spacing(4),
                  },
                }}
              >
                <TableCell
                  sx={{
                    paddingX: theme.spacing(2),
                    fontSize: 12,
                    opacity: 0.7,
                    whiteSpace: "nowrap",
                  }}
                  colSpan={canRunBulkActions ? 2 : 1}
                >
                  Showing {page * rowsPerPage + 1} -{" "}
                  {Math.min(page * rowsPerPage + rowsPerPage, sortedBodyData.length)} of{" "}
                  {sortedBodyData.length} items
                </TableCell>
                <TablePagination
                  count={sortedBodyData.length}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[5, 10, 15, 20, 25]}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  ActionsComponent={TablePaginationActions as React.ComponentType<any>}
                  labelRowsPerPage="Rows per page"
                  sx={{ mt: theme.spacing(6) }}
                  colSpan={visibleColumnKeys.length - 1}
                />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>

      {showLinkedPoliciesToEvidence && (
        <ProjectRiskLinkedPolicies
          type="evidence"
          evidenceId={selectedEvidenceId}
          isOpen={showLinkedPoliciesToEvidence}
          onClose={() => {
            setShowLinkedPoliciesToEvidence(false);
          }}
        />
      )}

      {canRunBulkActions && folderDialogOpen && (
        <ConfirmationModal
          isOpen
          title={`Move ${selectionCount} file${selectionCount === 1 ? "" : "s"} to a folder`}
          body={
            <Stack gap={2}>
              <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
                Adds to the chosen folder; existing assignments are preserved.
              </Typography>
              {foldersLoading ? (
                <Typography variant="body2" sx={{ color: "text.disabled", fontSize: 12 }}>
                  Loading folders...
                </Typography>
              ) : folders.length === 0 ? (
                <Typography variant="body2" sx={{ color: "text.disabled", fontSize: 12 }}>
                  No folders yet — create one from the file manager first.
                </Typography>
              ) : (
                <VWSelect
                  id="bulk-move-folder"
                  placeholder="Choose a folder…"
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(String(e.target.value))}
                  items={folders.map((f) => ({ _id: String(f.id), name: f.name }))}
                  sx={{ width: 280 }}
                />
              )}
            </Stack>
          }
          cancelText="Cancel"
          proceedText="Move"
          proceedButtonVariant="contained"
          confirmBtnSx={{
            opacity: selectedFolderId ? 1 : 0.5,
            pointerEvents: selectedFolderId ? "auto" : "none",
          }}
          onCancel={() => {
            if (bulkMutation.isPending) return;
            setFolderDialogOpen(false);
          }}
          onProceed={handleConfirmMoveToFolder}
          isLoading={bulkMutation.isPending}
        />
      )}

      {canRunBulkActions && tagsDialogOpen && (
        <ConfirmationModal
          isOpen
          title={`Edit tags on ${selectionCount} file${selectionCount === 1 ? "" : "s"}`}
          body={
            <Stack gap={2}>
              <Stack direction="row" alignItems="center" gap={2}>
                <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
                  Mode
                </Typography>
                <VWSelect
                  id="bulk-tag-mode"
                  value={tagMode}
                  onChange={(e) => handleTagModeChange(e.target.value as "set" | "add" | "remove")}
                  items={[
                    { _id: "add", name: "Add tags" },
                    { _id: "remove", name: "Remove tags" },
                    { _id: "set", name: "Replace tags" },
                  ]}
                  sx={{ width: 160 }}
                />
              </Stack>

              {tagMode === "remove" ? (
                dialogTagsSnapshot.length === 0 ? (
                  <Typography variant="body2" sx={{ color: "text.disabled", fontSize: 12 }}>
                    No tags on the selected file{selectionCount === 1 ? "" : "s"} to remove.
                  </Typography>
                ) : (
                  <CustomizableMultiSelect
                    label=""
                    placeholder="Pick tags to remove…"
                    isHidden
                    value={pendingTags}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPendingTags(
                        typeof v === "string"
                          ? v.split(",")
                          : (v as (string | number)[]).map(String),
                      );
                    }}
                    items={dialogTagsSnapshot.map((t: string) => ({ _id: t, name: t }))}
                    width={320}
                  />
                )
              ) : (
                <ChipInput
                  id="bulk-file-tags-input"
                  label="Tags"
                  value={pendingTags}
                  onChange={setPendingTags}
                  placeholder="Type a tag and press Enter"
                />
              )}

              {tagMode === "add" && dialogTagsSnapshot.length > 0 && (
                <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12 }}>
                  Already set: {dialogTagsSnapshot.join(", ")}
                </Typography>
              )}
              {tagMode === "set" && pendingTags.length === 0 && (
                <Typography variant="body2" sx={{ color: "warning.main", fontSize: 12 }}>
                  Empty Replace will clear all tags.
                </Typography>
              )}
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

export default FileBasicTable;
