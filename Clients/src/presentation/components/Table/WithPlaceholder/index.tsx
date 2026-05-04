import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  useTheme,
  Typography,
  TableFooter,
  Box,
  Stack,
} from "@mui/material";
import { useCallback, useMemo, useState, useEffect } from "react";
import IconButton from "../../IconButton";
import ViewRelationshipsButton from "../../ViewRelationshipsButton";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import singleTheme from "../../../themes/v1SingleTheme";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import TablePaginationActions from "../../TablePagination";
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Building2,
  ShieldCheck,
  FileSearch,
  AlertCircle,
} from "lucide-react";
import VendorRisksDialog from "../../VendorRisksDialog";
import allowedRoles from "../../../../application/constants/permissions";
import { useAuth } from "../../../../application/hooks/useAuth";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import { User } from "../../../../domain/types/User";
import { ITableWithPlaceholderProps } from "../../../types/interfaces/i.table";
import { ReviewStatus } from "../../../../domain/enums/status.enum";
import { getRiskScoreColor } from "../../../../domain/utils/vendorScorecard.utils";
import { VWLink } from "../../Link";
import VendorLogo from "../../VendorLogo";
import { text } from "../../../themes/palette";

const VENDORS_ROWS_PER_PAGE_KEY = "verifywise_vendors_rows_per_page";
const VENDORS_SORTING_KEY = "verifywise_vendors_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const titleOfTableColumns = [
  { id: "vendor_name", label: "name", sortable: true },
  { id: "assignee", label: "assignee", sortable: true },
  { id: "review_status", label: "status", sortable: true },
  { id: "risk", label: "risks", sortable: true },
  { id: "scorecard", label: "scorecard", sortable: true },
  { id: "review_date", label: "review date", sortable: true },
  { id: "actions", label: "", sortable: false },
];

const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);

// Sortable Table Header Component
const SortableTableHead: React.FC<{
  columns: typeof titleOfTableColumns;
  sortConfig: SortConfig;
  onSort: (columnId: string) => void;
}> = ({ columns, sortConfig, onSort }) => {
  const theme = useTheme();

  return (
    <TableHead
      sx={{
        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((column) => (
          <TableCell
            key={column.id}
            sx={{
              ...singleTheme.tableStyles.primary.header.cell,
              ...(column.sortable
                ? {
                    cursor: "pointer",
                    userSelect: "none",
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
                    color: sortConfig.key === column.id ? "primary.main" : `${text.disabled}`,
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

const TableWithPlaceholder: React.FC<ITableWithPlaceholderProps> = ({
  users,
  vendors,
  onDelete,
  onEdit,
  hidePagination = false,
  vendorRisks = [],
  visibleColumns,
}) => {
  const theme = useTheme();
  const { userRoleName } = useAuth();
  const [page, setPage] = useState(0);

  // Initialize rowsPerPage from localStorage or default to 5
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(VENDORS_ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 5;
  });

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(VENDORS_SORTING_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { key: "", direction: null };
      }
    }
    return { key: "", direction: null };
  });

  // Save rowsPerPage to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(VENDORS_ROWS_PER_PAGE_KEY, rowsPerPage.toString());
  }, [rowsPerPage]);

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(VENDORS_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  const [showVendorRisks, setShowVendorRisks] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const formattedUsers = users?.map((user: User) => ({
    _id: user.id,
    name: `${user.name} ${user.surname}`,
  }));

  // Get risk count for a specific vendor
  const getVendorRiskCount = useCallback(
    (vendorId: number) => {
      return vendorRisks.filter((risk) => risk.vendor_id === vendorId).length;
    },
    [vendorRisks],
  );

  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  const isDeletingAllowed = allowedRoles.vendors.delete.includes(userRoleName);

  const isVisible = useCallback(
    (key: string) => {
      if (!visibleColumns) return true;
      return visibleColumns.has(key);
    },
    [visibleColumns],
  );

  const visibleTableColumns = useMemo(
    () =>
      titleOfTableColumns.filter(
        (col) => col.id === "vendor_name" || col.id === "actions" || isVisible(col.id),
      ),
    [isVisible],
  );

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

  // Sort the vendors based on current sort configuration
  const sortedVendors = useMemo(() => {
    if (!vendors || !sortConfig.key || !sortConfig.direction) {
      return vendors || [];
    }

    const sortableVendors = [...vendors];

    return sortableVendors.sort((a: VendorModel, b: VendorModel) => {
      // Status order function based on actual ReviewStatus enum values
      const getStatusValue = (status: ReviewStatus) => {
        switch (status) {
          case ReviewStatus.NotStarted:
            return 1; // "Not started"
          case ReviewStatus.InReview:
            return 2; // "In review"
          case ReviewStatus.RequiresFollowUp:
            return 3; // "Requires follow-up"
          case ReviewStatus.Reviewed:
            return 4; // "Reviewed"
          default:
            return 0; // fallback for unknown values
        }
      };

      let aValue: string | number;
      let bValue: string | number;

      switch (sortConfig.key) {
        case "vendor_name":
          aValue = a.vendor_name.toLowerCase();
          bValue = b.vendor_name.toLowerCase();
          break;

        case "assignee":
          aValue = a.assignee;
          bValue = b.assignee;
          break;

        case "review_status":
          aValue = getStatusValue(a.review_status);
          bValue = getStatusValue(b.review_status);
          break;

        case "review_date":
          aValue = new Date(a.review_date).getTime();
          bValue = new Date(b.review_date).getTime();
          break;

        case "scorecard":
          aValue = a.risk_score ?? 0;
          bValue = b.risk_score ?? 0;
          break;

        case "risk":
          aValue = getVendorRiskCount(a.id!);
          bValue = getVendorRiskCount(b.id!);
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
  }, [vendors, sortConfig, getVendorRiskCount]);

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  const openVendorRisksDialog = useCallback((vendorId: number, vendorName: string) => {
    setSelectedVendor({ id: vendorId, name: vendorName });
    setShowVendorRisks(true);
  }, []);

  const closeVendorRisksDialog = useCallback(() => {
    setShowVendorRisks(false);
    setSelectedVendor(null);
  }, []);

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(page * rowsPerPage + rowsPerPage, sortedVendors?.length ?? 0);
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedVendors?.length]);

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedVendors &&
          sortedVendors
            .slice(
              hidePagination ? 0 : page * rowsPerPage,
              hidePagination
                ? Math.min(sortedVendors.length, 100)
                : page * rowsPerPage + rowsPerPage,
            )
            .map((row: VendorModel, index: number) => (
              <TableRow
                key={index}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  cursor: "pointer",
                  "&:hover": {
                    backgroundColor: "background.surface",
                  },
                  outline: "none",
                }}
                onClick={() => onEdit(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEdit(row.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Edit vendor ${row.vendor_name}`}
              >
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    backgroundColor: sortConfig.key === "vendor_name" ? "#e8e8e8" : "#fafafa",
                  }}
                >
                  <VendorLogo
                    website={row.website || ""}
                    vendorName={row.vendor_name}
                    size={32}
                    showName={true}
                  />
                </TableCell>
                {isVisible("assignee") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "assignee" ? "background.surface" : "inherit",
                    }}
                  >
                    {row.assignee
                      ? formattedUsers?.find(
                          (user: { _id: number; name: string }) => user._id === row.assignee,
                        )?.name || "Unassigned"
                      : "Unassigned"}
                  </TableCell>
                )}
                {isVisible("review_status") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "review_status" ? "background.surface" : "inherit",
                    }}
                  >
                    {row.review_status}
                  </TableCell>
                )}
                {isVisible("risk") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor: sortConfig.key === "risk" ? "background.surface" : "inherit",
                    }}
                  >
                    {(() => {
                      const riskCount = getVendorRiskCount(row.id!);
                      return riskCount > 0 ? (
                        <VWLink
                          onClick={(e) => {
                            e.stopPropagation();
                            openVendorRisksDialog(row.id!, row.vendor_name);
                          }}
                          showIcon={false}
                        >
                          {riskCount} risk{riskCount !== 1 ? "s" : ""}
                        </VWLink>
                      ) : (
                        <Typography variant="body2" sx={{ color: "text.muted" }}>
                          No risks
                        </Typography>
                      );
                    })()}
                  </TableCell>
                )}
                {isVisible("scorecard") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "scorecard" ? "background.surface" : "inherit",
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1}>
                      {(() => {
                        // Use only backend provided risk_score, no client-side calculations
                        const riskScore = row.risk_score ?? 0;
                        const riskColor = getRiskScoreColor(riskScore);

                        return (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              padding: "4px 8px",
                              borderRadius: "4px",
                              backgroundColor: `${riskColor}20`,
                              border: `1px solid ${riskColor}`,
                              minWidth: "50px",
                            }}
                          >
                            <Box
                              sx={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                backgroundColor: riskColor,
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "11px",
                                fontWeight: 500,
                                color: riskColor,
                              }}
                            >
                              {riskScore}%
                            </Typography>
                          </Box>
                        );
                      })()}
                    </Box>
                  </TableCell>
                )}
                {isVisible("review_date") && (
                  <TableCell
                    sx={{
                      ...cellStyle,
                      backgroundColor:
                        sortConfig.key === "review_date" ? "background.surface" : "inherit",
                    }}
                  >
                    {row.review_date
                      ? displayFormattedDate(row.review_date.toString())
                      : "No review date"}
                  </TableCell>
                )}
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <ViewRelationshipsButton
                      entityId={row.id || 0}
                      entityType="vendor"
                      entityLabel={row.vendor_name || undefined}
                    />
                    <IconButton
                      id={row.id!}
                      onDelete={() => onDelete(row.id)}
                      onEdit={() => onEdit(row.id)}
                      onMouseEvent={() => {}}
                      warningTitle="Delete this vendor?"
                      warningMessage="When you delete this vendor, all data related to this vendor will be removed. This action is non-recoverable."
                      type="Vendor"
                      canDelete={isDeletingAllowed} // pass down as a prop
                    />
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    ),
    [
      sortedVendors,
      page,
      rowsPerPage,
      cellStyle,
      openVendorRisksDialog,
      formattedUsers,
      onEdit,
      onDelete,
      isDeletingAllowed,
      sortConfig.key,
      getVendorRiskCount,
      hidePagination,
      isVisible,
    ],
  );

  return (
    <>
      {!sortedVendors || sortedVendors.length === 0 ? (
        <EmptyState
          icon={Building2}
          message="No vendors registered yet. Track third-party AI providers and assess their risk."
          showBorder
        >
          <EmptyStateTip
            icon={ShieldCheck}
            title="Assess vendor risk tiers"
            description="Classify each vendor as low, medium, or high risk based on data access, system criticality, and contractual protections."
          />
          <EmptyStateTip
            icon={FileSearch}
            title="Track contracts and assessments"
            description="Record contract dates and last assessment dates. Keep track of when renewals and reassessments are due."
          />
          <EmptyStateTip
            icon={AlertCircle}
            title="Common AI vendors to register"
            description="OpenAI, Anthropic, Google Cloud AI, AWS Bedrock, Microsoft Azure AI, Hugging Face, and any custom ML service providers you use."
          />
        </EmptyState>
      ) : (
        <TableContainer>
          <Table sx={singleTheme.tableStyles.primary.frame}>
            <SortableTableHead
              columns={visibleTableColumns}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
            {tableBody}
            {!hidePagination && (
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
                    }}
                  >
                    Showing {getRange} of {sortedVendors?.length} vendor(s)
                  </TableCell>
                  <TablePagination
                    count={sortedVendors?.length}
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
                        MenuProps: {
                          keepMounted: true,
                          PaperProps: {
                            className: "pagination-dropdown",
                            sx: {
                              mt: 0,
                              mb: theme.spacing(2),
                            },
                          },
                          transformOrigin: {
                            vertical: "bottom",
                            horizontal: "left",
                          },
                          anchorOrigin: {
                            vertical: "top",
                            horizontal: "left",
                          },
                          sx: { mt: theme.spacing(-2) },
                        },
                        inputProps: { id: "pagination-dropdown" },
                        IconComponent: SelectorVertical,
                        sx: {
                          ml: theme.spacing(4),
                          mr: theme.spacing(12),
                          minWidth: theme.spacing(20),
                          textAlign: "left",
                          "&.Mui-focused > div": {
                            backgroundColor: theme.palette.background.main,
                          },
                        },
                      },
                    }}
                    sx={{
                      mt: theme.spacing(6),
                      color: theme.palette.text.secondary,
                      "& .MuiSelect-icon": {
                        width: "24px",
                        height: "fit-content",
                      },
                      "& .MuiSelect-select": {
                        width: theme.spacing(10),
                        borderRadius: theme.shape.borderRadius,
                        border: `1px solid ${theme.palette.border.light}`,
                        padding: theme.spacing(4),
                      },
                    }}
                  />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>
      )}

      {/* Vendor Risks Dialog */}
      {showVendorRisks && selectedVendor && (
        <VendorRisksDialog
          open={showVendorRisks}
          onClose={closeVendorRisksDialog}
          vendorId={selectedVendor.id}
          vendorName={selectedVendor.name}
        />
      )}
    </>
  );
};

export default TableWithPlaceholder;
