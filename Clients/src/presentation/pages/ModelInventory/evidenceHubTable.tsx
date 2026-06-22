/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  useTheme,
  Stack,
  Typography,
  TableFooter,
  Tooltip,
  Box,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton as MuiIconButton,
} from "@mui/material";
import TablePaginationActions from "../../components/TablePagination";
import CustomizableSkeleton from "../../components/Skeletons";
import CustomIconButton from "../../components/IconButton";
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  FileCheck,
  FolderOpen,
  Shield,
  Clock,
  Sparkles,
  X,
} from "lucide-react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { displayFormattedDate } from "../../tools/isoDateToString";
import { User } from "../../../domain/types/User";
import { getAllEntities } from "../../../application/repository/entity.repository";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { FileIcon } from "../../components/FileIcon";
import EvidenceQualityBadge from "../../components/EvidenceQualityBadge";
import EvidenceAnalysisPanel from "../../components/EvidenceAnalysisPanel";
import { useQualityScores, useTriggerAnalysis } from "../../../application/hooks/useEvidenceAi";
import { text as textColors, border as borderPalette } from "../../themes/palette";
import {
  paginationMenuProps,
  paginationStyle,
  showingTextCellStyle,
  tableFooterRowStyle,
  tableRowDeletingStyle,
  tableRowHoverStyle,
} from "./style";
import { singleTheme } from "../../themes";
import { palette } from "../../themes/palette";
import { EvidenceHubTableProps } from "../../../domain/interfaces/i.modelInventory";

dayjs.extend(utc);

const EVIDENCE_HUB_SORTING_KEY = "verifywise_evidence_hub_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const TABLE_COLUMNS = [
  { id: "evidence_name", label: "EVIDENCE NAME", sortable: true },
  { id: "evidence_type", label: "TYPE", sortable: true },
  { id: "mapped_models", label: "MAPPED MODELS", sortable: false },
  { id: "mapped_trainings", label: "MAPPED TRAININGS", sortable: false },
  { id: "tags", label: "TAGS", sortable: false },
  { id: "frameworks", label: "FRAMEWORKS", sortable: false },
  { id: "reviewer", label: "REVIEWER", sortable: true },
  { id: "retention_policy", label: "RETENTION", sortable: true },
  { id: "uploaded_by", label: "UPLOADED BY", sortable: true },
  { id: "uploaded_on", label: "UPLOADED ON", sortable: true },
  { id: "expiry_date", label: "EXPIRY", sortable: true },
  { id: "quality", label: "QUALITY", sortable: true },
  { id: "actions", label: "", sortable: false },
];

const TooltipCell = ({ value }: { value: string }) => {
  const truncate = (text: string, length = 25) => {
    if (!text) return "";
    return text.length > length ? text.substring(0, length) + "..." : text;
  };

  return (
    <Tooltip title={value}>
      <span>{truncate(value)}</span>
    </Tooltip>
  );
};

// Sortable Table Header Component
const SortableTableHead: React.FC<{
  columns: typeof TABLE_COLUMNS;
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
  theme: any;
}> = ({ columns, sortConfig, onSort, theme }) => {
  return (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((column) => (
          <TableCell
            component={"td"}
            className="evidence-hub-table-header-cel"
            key={column.id}
            sx={{
              ...singleTheme.tableStyles.primary.header.cell,
              ...(column.sortable
                ? {
                    "cursor": "pointer",
                    "userSelect": "none",
                    "&:hover": {
                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                    },
                  }
                : {}),
            }}
            onClick={() => column.sortable && onSort(column.id)}
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
                  color: sortConfig.key === column.id ? "primary.main" : "inherit",
                }}
              >
                {column.label}
              </Typography>
              {column.sortable && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color: sortConfig.key === column.id ? "primary.main" : palette.text.disabled,
                  }}
                >
                  {sortConfig.key === column.id && sortConfig.direction === "asc" && (
                    <ChevronUp size={16} />
                  )}
                  {sortConfig.key === column.id && sortConfig.direction === "desc" && (
                    <ChevronDown size={16} />
                  )}
                  {sortConfig.key !== column.id && <ChevronsUpDown size={16} />}
                </Box>
              )}
            </Box>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
};

const EvidenceHubTable: React.FC<EvidenceHubTableProps> = ({
  data,
  isLoading,
  onEdit,
  onDelete,
  onPreview,
  paginated = true,
  deletingId,
  modelInventoryData,
  trainingData,
  hidePagination = false,
  visibleColumns,
}) => {
  const theme = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(0);
  const { data: qualityScoresData } = useQualityScores();
  const triggerAnalysis = useTriggerAnalysis();
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any | null>(null);

  // Filter columns based on visibleColumns prop
  const visibleTableColumns = useMemo(() => {
    if (!visibleColumns || visibleColumns.size === 0) return TABLE_COLUMNS;
    return TABLE_COLUMNS.filter((col) => visibleColumns.has(col.id));
  }, [visibleColumns]);

  // Helper to check if a column is visible
  const isColVisible = useCallback(
    (columnId: string) => {
      if (!visibleColumns || visibleColumns.size === 0) return true;
      return visibleColumns.has(columnId);
    },
    [visibleColumns],
  );

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(EVIDENCE_HUB_SORTING_KEY);
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
    localStorage.setItem(EVIDENCE_HUB_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  // Fetch users for uploaded_by mapping
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await getAllEntities({ routeUrl: "/users" });
      if (res?.data) setUsers(res.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  // Create a mapping of user IDs to user names
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((user) => {
      map.set(user.id.toString(), `${user.name} ${user.surname}`.trim());
    });
    return map;
  }, [users]);

  const modelMap = useMemo(() => {
    const map = new Map<number, string>();

    modelInventoryData
      ?.filter((m) => typeof m.id === "number")
      .forEach((m) => {
        map.set(
          m.id!, // safe because we filtered above
          `${m.provider} - ${m.model}`,
        );
      });

    return map;
  }, [modelInventoryData]);

  // Build a map of file_id → quality score from AI analysis data
  const qualityMap = useMemo(() => {
    const map = new Map<number, number>();
    if (qualityScoresData && Array.isArray(qualityScoresData)) {
      qualityScoresData.forEach((item: any) => {
        if (item.file_id && item.overall_quality_score != null) {
          map.set(item.file_id, item.overall_quality_score);
        }
      });
    }
    return map;
  }, [qualityScoresData]);

  // Full analysis map: file_id → AI analysis object (used by detail dialog)
  const qualityAnalysisMap = useMemo(() => {
    const map = new Map<number, any>();
    if (qualityScoresData && Array.isArray(qualityScoresData)) {
      qualityScoresData.forEach((item: any) => {
        if (item.file_id) {
          map.set(item.file_id, item);
        }
      });
    }
    return map;
  }, [qualityScoresData]);
  const trainingMap = useMemo(() => {
    const map = new Map<number, string>();
    (trainingData ?? []).forEach((t) => {
      const idNum = typeof t.id === "string" ? Number(t.id) : t.id;
      if (typeof idNum === "number" && !Number.isNaN(idNum)) {
        map.set(idNum, t.training_name || `Training ${idNum}`);
      }
    });
    return map;
  }, [trainingData]);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  // Sorting handler
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

  // Sort the data based on current sort configuration
  const sortedData = useMemo(() => {
    if (!data || !sortConfig.key || !sortConfig.direction) {
      return data || [];
    }

    const sortableData = [...data];

    return sortableData.sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      switch (sortConfig.key) {
        case "evidence_name":
          aValue = a.evidence_name?.toLowerCase() || "";
          bValue = b.evidence_name?.toLowerCase() || "";
          break;

        case "evidence_type":
          aValue = a.evidence_type?.toLowerCase() || "";
          bValue = b.evidence_type?.toLowerCase() || "";
          break;

        case "reviewer":
          aValue = a.reviewer_id ? userMap.get(a.reviewer_id.toString())?.toLowerCase() || "" : "";
          bValue = b.reviewer_id ? userMap.get(b.reviewer_id.toString())?.toLowerCase() || "" : "";
          break;

        case "retention_policy":
          aValue = a.retention_policy?.toLowerCase() || "";
          bValue = b.retention_policy?.toLowerCase() || "";
          break;

        case "uploaded_by":
          aValue =
            a.evidence_files && a.evidence_files.length > 0
              ? userMap.get(a.evidence_files[0].uploaded_by.toString())?.toLowerCase() || ""
              : "";
          bValue =
            b.evidence_files && b.evidence_files.length > 0
              ? userMap.get(b.evidence_files[0].uploaded_by.toString())?.toLowerCase() || ""
              : "";
          break;

        case "uploaded_on": {
          const aDate =
            a.evidence_files && a.evidence_files.length > 0
              ? ((a.evidence_files[0] as any).upload_date ??
                (a.evidence_files[0] as any).uploaded_time)
              : null;
          const bDate =
            b.evidence_files && b.evidence_files.length > 0
              ? ((b.evidence_files[0] as any).upload_date ??
                (b.evidence_files[0] as any).uploaded_time)
              : null;
          aValue = aDate ? new Date(aDate).getTime() : 0;
          bValue = bDate ? new Date(bDate).getTime() : 0;
          break;
        }

        case "expiry_date":
          aValue = a.expiry_date ? new Date(a.expiry_date).getTime() : 0;
          bValue = b.expiry_date ? new Date(b.expiry_date).getTime() : 0;
          break;

        default:
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
  }, [data, sortConfig, userMap]);

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, sortedData?.length ?? 0);
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedData?.length]);

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedData?.length ? (
          sortedData
            .slice(
              hidePagination ? 0 : page * rowsPerPage,
              hidePagination ? Math.min(sortedData.length, 100) : page * rowsPerPage + rowsPerPage,
            )
            .map((evidence) => (
              <TableRow
                key={evidence.id}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  ...tableRowHoverStyle,
                  ...(deletingId === evidence.id && tableRowDeletingStyle),
                }}
                // onClick={(e) => {
                //   e.stopPropagation();
                //   onEdit?.(Number(evidence.id));
                // }}
              >
                {isColVisible("evidence_name") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Stack direction="column" spacing={0.5}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <FileIcon
                          fileName={
                            evidence.evidence_files && evidence.evidence_files.length > 0
                              ? ((evidence.evidence_files[0] as any).filename ??
                                (evidence.evidence_files[0] as any).fileName ??
                                "")
                              : ""
                          }
                        />
                        {evidence.evidence_name}
                      </Box>
                      {evidence.evidence_files && evidence.evidence_files.length > 1 && (
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "4px",
                            pl: "24px",
                          }}
                        >
                          {evidence.evidence_files.map((f: any, idx: number) => {
                            const name = f.filename ?? f.fileName ?? `File ${idx + 1}`;
                            return (
                              <Tooltip key={`${f.id}-${idx}`} title={`Preview ${name}`}>
                                <Chip
                                  label={name}
                                  size="small"
                                  clickable
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onPreview?.(evidence.id || 0, idx);
                                  }}
                                  sx={{
                                    "height": 20,
                                    "fontSize": 11,
                                    "maxWidth": 180,
                                    "& .MuiChip-label": {
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    },
                                  }}
                                />
                              </Tooltip>
                            );
                          })}
                        </Box>
                      )}
                    </Stack>
                  </TableCell>
                )}
                {isColVisible("evidence_type") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <TooltipCell value={evidence.evidence_type} />
                  </TableCell>
                )}
                {isColVisible("mapped_models") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <TooltipCell
                      value={
                        evidence.mapped_model_ids?.length
                          ? evidence.mapped_model_ids
                              .map((id) => modelMap.get(id) || `Model ${id}`)
                              .join(", ")
                          : "-"
                      }
                    />
                  </TableCell>
                )}
                {isColVisible("mapped_trainings") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <TooltipCell
                      value={
                        evidence.mapped_training_ids?.length
                          ? evidence.mapped_training_ids
                              .map((id) => trainingMap.get(id) || `Training ${id}`)
                              .join(", ")
                          : "-"
                      }
                    />
                  </TableCell>
                )}
                {isColVisible("tags") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {evidence.tags && evidence.tags.length > 0 ? (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                        {evidence.tags.slice(0, 2).map((tag) => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            sx={{ height: 20, fontSize: 11 }}
                          />
                        ))}
                        {evidence.tags.length > 2 && (
                          <Tooltip title={evidence.tags.slice(2).join(", ")}>
                            <Chip
                              label={`+${evidence.tags.length - 2}`}
                              size="small"
                              sx={{ height: 20, fontSize: 11 }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                )}
                {isColVisible("frameworks") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {evidence.framework_ids && evidence.framework_ids.length > 0 ? (
                      <TooltipCell value={evidence.framework_ids.join(", ")} />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                )}
                {isColVisible("reviewer") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {evidence.reviewer_id
                      ? userMap.get(evidence.reviewer_id.toString()) || "-"
                      : "-"}
                  </TableCell>
                )}
                {isColVisible("retention_policy") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {evidence.retention_policy ? evidence.retention_policy.replace(/_/g, " ") : "-"}
                  </TableCell>
                )}
                {isColVisible("uploaded_by") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <TooltipCell
                      value={
                        evidence.evidence_files && evidence.evidence_files.length > 0
                          ? userMap.get(evidence.evidence_files[0].uploaded_by.toString()) || "-"
                          : "-"
                      }
                    />
                  </TableCell>
                )}
                {isColVisible("uploaded_on") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {(() => {
                      const f = evidence.evidence_files?.[0] as any;
                      const d = f?.upload_date ?? f?.uploaded_time;
                      return d ? displayFormattedDate(d) : "-";
                    })()}
                  </TableCell>
                )}
                {isColVisible("expiry_date") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {evidence.expiry_date ? displayFormattedDate(evidence.expiry_date) : "-"}
                  </TableCell>
                )}
                {isColVisible("quality") && (
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {(() => {
                      const fileId = evidence.evidence_files?.[0]?.id;
                      const score = fileId ? qualityMap.get(Number(fileId)) : undefined;
                      const analysis = fileId ? qualityAnalysisMap.get(Number(fileId)) : undefined;
                      return score != null ? (
                        <EvidenceQualityBadge
                          score={score}
                          onClick={
                            analysis
                              ? (e) => {
                                  e.stopPropagation();
                                  setSelectedAnalysis(analysis);
                                }
                              : undefined
                          }
                        />
                      ) : (
                        <Typography sx={{ fontSize: 11, color: palette.text.disabled }}>
                          -
                        </Typography>
                      );
                    })()}
                  </TableCell>
                )}
                <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                  <Stack direction="row" spacing={1}>
                    {evidence.evidence_files?.[0]?.id && (
                      <Tooltip
                        title={
                          qualityMap.has(Number(evidence.evidence_files[0].id))
                            ? "Re-analyze with AI"
                            : "Analyze with AI"
                        }
                      >
                        <Box
                          component="button"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            const fileId = Number(evidence.evidence_files[0].id);
                            if (fileId) triggerAnalysis.mutate(fileId);
                          }}
                          sx={{
                            "display": "flex",
                            "alignItems": "center",
                            "justifyContent": "center",
                            "width": 28,
                            "height": 28,
                            "borderRadius": "6px",
                            "border": "1px solid",
                            "borderColor": triggerAnalysis.isPending ? "#ccc" : "#7C3AED",
                            "backgroundColor": triggerAnalysis.isPending ? "#f5f5f5" : "#F5F3FF",
                            "color": triggerAnalysis.isPending ? "#999" : "#7C3AED",
                            "cursor": triggerAnalysis.isPending ? "wait" : "pointer",
                            "padding": 0,
                            "&:hover": {
                              backgroundColor: triggerAnalysis.isPending ? "#f5f5f5" : "#EDE9FE",
                            },
                          }}
                          disabled={triggerAnalysis.isPending}
                        >
                          <Sparkles size={14} />
                        </Box>
                      </Tooltip>
                    )}
                    <CustomIconButton
                      id={evidence.id || 0}
                      onDelete={() => onDelete?.(evidence.id || 0)}
                      onEdit={() => {
                        onEdit?.(evidence.id || 0);
                      }}
                      onPreview={onPreview ? () => onPreview(evidence.id || 0) : undefined}
                      type=""
                      warningTitle="Delete this evidence?"
                      warningMessage="When you delete this evidence, all data related to this evidence will be removed. This action is non-recoverable."
                      onMouseEvent={() => {}}
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            ))
        ) : (
          <TableRow>
            <TableCell colSpan={visibleTableColumns.length} align="center">
              <EmptyState
                message="No evidence yet. Upload documents that prove compliance with each requirement."
                icon={FileCheck}
              >
                <EmptyStateTip
                  icon={FolderOpen}
                  title="Organize by control category"
                  description="Group evidence by the controls they support. This makes audit preparation faster and keeps your evidence library structured."
                />
                <EmptyStateTip
                  icon={Shield}
                  title="What counts as evidence?"
                  description="Policies, meeting minutes, configuration screenshots, training records, risk assessments, vendor agreements, and change logs."
                />
                <EmptyStateTip
                  icon={Clock}
                  title="Track expiry dates"
                  description="Set expiry dates on evidence so you're reminded to update or re-certify documents before they become stale."
                />
              </EmptyState>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    ),
    [
      sortedData,
      page,
      rowsPerPage,
      deletingId,
      userMap,
      onEdit,
      onPreview,
      modelMap,
      onDelete,
      isColVisible,
      visibleTableColumns,
      qualityMap,
      qualityAnalysisMap,
      triggerAnalysis,
      hidePagination,
    ],
  );

  if (isLoading) {
    return (
      <Stack spacing={2}>
        <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
      </Stack>
    );
  }

  return (
    <>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table sx={singleTheme.tableStyles.primary.frame}>
          <SortableTableHead
            columns={visibleTableColumns}
            sortConfig={sortConfig}
            onSort={handleSort}
            theme={theme}
          />
          {tableBody}
          {paginated && !hidePagination && data && data.length > 0 && (
            <TableFooter>
              <TableRow sx={tableFooterRowStyle(theme)}>
                <TableCell sx={showingTextCellStyle(theme)}>
                  Showing {getRange} of {sortedData?.length} model(s)
                </TableCell>
                <TablePagination
                  count={sortedData?.length ?? 0}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  rowsPerPageOptions={[5, 10, 15, 25]}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  ActionsComponent={(props) => <TablePaginationActions {...props} />}
                  labelRowsPerPage="Rows per page"
                  labelDisplayedRows={({ page, count }) =>
                    `Page ${page + 1} of ${Math.max(0, Math.ceil(count / rowsPerPage))}`
                  }
                  slotProps={{
                    select: {
                      MenuProps: paginationMenuProps(theme),
                      inputProps: {
                        id: "pagination-dropdown",
                      },
                    },
                  }}
                  sx={paginationStyle(theme)}
                />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>

      {/* Quality Score Detail Dialog — AIAuditDashboard pattern */}
      <Dialog
        open={selectedAnalysis !== null}
        onClose={() => setSelectedAnalysis(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "4px",
            border: `1px solid ${borderPalette.dark}`,
            backgroundColor: "transparent",
          },
        }}
      >
        <DialogTitle
          sx={{
            fontSize: 16,
            fontWeight: 600,
            color: textColors.primary,
            fontFamily: "'Red Hat Display', 'Geist', sans-serif",
            borderBottom: `1px solid ${borderPalette.light}`,
            backgroundColor: "#FFFFFF",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            py: 1.75,
            px: 3,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 600,
                color: textColors.primary,
                fontFamily: "'Red Hat Display', 'Geist', sans-serif",
                lineHeight: 1.3,
              }}
            >
              Evidence Quality Details
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                color: textColors.secondary,
                mt: 0.25,
                fontWeight: 400,
              }}
            >
              AI-derived score breakdown across 5 dimensions
            </Typography>
          </Box>
          <MuiIconButton
            onClick={() => setSelectedAnalysis(null)}
            size="small"
            sx={{ color: textColors.secondary }}
          >
            <X size={18} />
          </MuiIconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {selectedAnalysis && <EvidenceAnalysisPanel analysis={selectedAnalysis} />}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EvidenceHubTable;
