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
  Box,
  Tooltip,
  TableFooter,
  Stack,
} from "@mui/material";
import { useCallback, useMemo, useState, useEffect } from "react";
import singleTheme from "../../../themes/v1SingleTheme";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import IconButton from "../../IconButton";
import ViewRelationshipsButton from "../../ViewRelationshipsButton";
import TablePaginationActions from "../../TablePagination";
import Chip from "../../Chip";
import { ChevronsUpDown, ChevronUp, ChevronDown, ShieldAlert, TrendingDown, Grid3X3, ListChecks } from "lucide-react";
import { VendorRisk } from "../../../../domain/types/VendorRisk";
import { User } from "../../../../domain/types/User";
import { IRiskTableProps } from "../../../types/interfaces/i.table";
import { VWLink } from "../../Link";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import { text } from "../../../themes/palette";

const VENDOR_RISKS_ROWS_PER_PAGE_KEY = "verifywise_vendor_risks_rows_per_page";
const VENDOR_RISKS_SORTING_KEY = "verifywise_vendor_risks_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const SelectorVertical = (props: React.SVGAttributes<SVGSVGElement>) => (
  <ChevronsUpDown size={16} {...props} />
);

const titleOfTableColumns = [
  { id: "risk_description", label: "risk description", sortable: true },
  { id: "vendor_name", label: "vendor", sortable: true },
  { id: "project_titles", label: "use case", sortable: true },
  { id: "action_owner", label: "action owner", sortable: true },
  { id: "risk_severity", label: "risk severity", sortable: true },
  { id: "risk_level", label: "risk level", sortable: true },
  { id: "actions", label: " ", sortable: false },
];

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
        backgroundColor:
          singleTheme.tableStyles.primary.header.backgroundColors,
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
                  color:
                    sortConfig.key === column.id ? "primary.main" : "inherit",
                }}
              >
                {column.label}
              </Typography>
              {column.sortable && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color:
                      sortConfig.key === column.id ? "primary.main" : `${text.disabled}`,
                  }}
                >
                  {sortConfig.key === column.id &&
                    sortConfig.direction === "asc" && <ChevronUp size={16} />}
                  {sortConfig.key === column.id &&
                    sortConfig.direction === "desc" && (
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

const RiskTable: React.FC<IRiskTableProps> = ({
  users,
  vendors,
  vendorRisks,
  onDelete,
  onEdit,
  isDeletingAllowed = true,
  hidePagination = false,
  visibleColumns,
}) => {
  const theme = useTheme();
  const [page, setPage] = useState(0);

  // Initialize rowsPerPage from localStorage or default to 5
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem(VENDOR_RISKS_ROWS_PER_PAGE_KEY);
    return saved ? parseInt(saved, 10) : 5;
  });

  // Initialize sorting state from localStorage or default to no sorting
  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(VENDOR_RISKS_SORTING_KEY);
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
    localStorage.setItem(
      VENDOR_RISKS_ROWS_PER_PAGE_KEY,
      rowsPerPage.toString()
    );
  }, [rowsPerPage]);

  // Save sorting state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(VENDOR_RISKS_SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  const [dropdownAnchor, setDropdownAnchor] = useState<HTMLElement | null>(
    null
  );
  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  const isVisible = useCallback(
    (key: string) => {
      if (!visibleColumns) return true;
      return visibleColumns.has(key);
    },
    [visibleColumns]
  );

  const visibleTableColumns = useMemo(
    () =>
      titleOfTableColumns.filter(
        (col) => col.id === "risk_description" || col.id === "actions" || isVisible(col.id)
      ),
    [isVisible]
  );

  const getCellStyle = (row: VendorRisk) => ({
    ...cellStyle,
    ...(row.is_deleted && {
      textDecoration: "line-through",
    }),
  });
  const formattedUsers = users?.map((user: User) => ({
    _id: user.id,
    name: `${user.name} ${user.surname}`,
  }));

  const formattedVendors = useMemo(() => {
    return vendors.map((vendor: VendorModel) => ({
      _id: vendor.id!,
      name: vendor.vendor_name,
    }));
  }, [vendors]);

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

  const handleChangePage = useCallback((_: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRowsPerPage(parseInt(event.target.value, 10));
      setPage(0);
    },
    []
  );

  const handleDropdownClose = useCallback(() => {
    setDropdownAnchor(null);
  }, []);

  // Group risks by id so each risk appears only once, and collect all project titles
  const groupedRisks: Record<
    number,
    VendorRisk & { project_titles: string[] }
  > = {};
  vendorRisks?.forEach((row: VendorRisk & { project_title?: string }) => {
    const key = row.risk_id!;
    if (!groupedRisks[key]) {
      groupedRisks[key] = {
        ...row,
        project_titles: row.project_title ? [row.project_title] : [],
      };
    } else if (row.project_title) {
      groupedRisks[key].project_titles.push(row.project_title);
    }
  });
  const uniqueRisks = Object.values(groupedRisks).map((risk) => ({
    ...risk,
    project_titles: Array.from(new Set(risk.project_titles)).join(", "),
  }));

  // Sort the risks based on current sort configuration
  const sortedRisks = useMemo(() => {
    if (!uniqueRisks || !sortConfig.key || !sortConfig.direction) {
      return uniqueRisks || [];
    }

    const sortableRisks = [...uniqueRisks];

    // Helper functions for sorting
    const getSeverityValue = (severity: string) => {
      const severityLower = severity.toLowerCase();
      if (severityLower.includes("catastrophic")) return 6;
      if (severityLower.includes("critical")) return 5;
      if (severityLower.includes("major")) return 4;
      if (severityLower.includes("moderate")) return 3;
      if (severityLower.includes("minor")) return 2;
      if (severityLower.includes("negligible")) return 1;
      return 0;
    };

    const getLikelihoodValue = (likelihood: string) => {
      const likelihoodLower = likelihood.toLowerCase();
      if (likelihoodLower.includes("almost certain")) return 5;
      if (likelihoodLower.includes("likely")) return 4;
      if (likelihoodLower.includes("possible")) return 3;
      if (likelihoodLower.includes("unlikely")) return 2;
      if (likelihoodLower.includes("rare")) return 1;
      return 0;
    };

    const getRiskLevelValue = (riskLevel: string) => {
      const riskLower = riskLevel.toLowerCase();
      if (riskLower.includes("high") || riskLower.includes("critical"))
        return 3;
      if (riskLower.includes("medium") || riskLower.includes("moderate"))
        return 2;
      if (riskLower.includes("low") || riskLower.includes("minor")) return 1;
      return 0;
    };

    return sortableRisks.sort(
      (
        a: VendorRisk & { project_titles: string; vendor_name?: string },
        b: VendorRisk & { project_titles: string; vendor_name?: string }
      ) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortConfig.key) {
          case "risk_description":
            aValue = a.risk_description.toLowerCase();
            bValue = b.risk_description.toLowerCase();
            break;

          case "vendor_name":
            aValue = a.vendor_name ? a.vendor_name.toLowerCase() : "";
            bValue = b.vendor_name ? b.vendor_name.toLowerCase() : "";
            break;

          case "project_titles":
            aValue = a.project_titles.toLowerCase();
            bValue = b.project_titles.toLowerCase();
            break;

          case "action_owner":
            aValue = a.action_owner;
            bValue = b.action_owner;
            break;

          case "risk_severity":
            // Severity order: Catastrophic > Critical > Major > Moderate > Minor > Negligible
            aValue = getSeverityValue(a.risk_severity);
            bValue = getSeverityValue(b.risk_severity);
            break;

          case "likelihood":
            // Likelihood order: Almost certain > Likely > Possible > Unlikely > Rare
            aValue = getLikelihoodValue(a.likelihood);
            bValue = getLikelihoodValue(b.likelihood);
            break;

          case "risk_level":
            // Risk level order: High > Medium > Low (assuming these are the values)
            aValue = getRiskLevelValue(a.risk_level);
            bValue = getRiskLevelValue(b.risk_level);
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
      }
    );
  }, [uniqueRisks, sortConfig]);

  const getRange = useMemo(() => {
    const start = page * rowsPerPage + 1;
    const end = Math.min(
      page * rowsPerPage + rowsPerPage,
      sortedRisks?.length ?? 0
    );
    return `${start} - ${end}`;
  }, [page, rowsPerPage, sortedRisks?.length]);

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedRisks &&
          sortedRisks
            .slice(
              hidePagination ? 0 : page * rowsPerPage,
              hidePagination
                ? Math.min(sortedRisks.length, 100)
                : page * rowsPerPage + rowsPerPage
            )
            .map((row: VendorRisk & { project_titles: string }) => (
              <TableRow
                key={row.risk_id}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  ...(row.is_deleted && {
                    opacity: 0.7,
                    backgroundColor: theme.palette.action?.hover || "#fafafa",
                  }),
                }}
                onClick={() => onEdit(row.risk_id!)}
              >
                <TableCell
                  sx={{
                    ...getCellStyle(row),
                    maxWidth: 300,
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                    backgroundColor:
                      sortConfig.key === "risk_description"
                        ? "#e8e8e8"
                        : "#fafafa",
                  }}
                >
                  <Tooltip title={row.risk_description} arrow placement="top">
                    <Box
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        lineHeight: "1.4em",
                        maxHeight: "2.8em",
                      }}
                    >
                      {row.risk_description.length > 20
                        ? `${row.risk_description.substring(0, 20)}...`
                        : row.risk_description}
                    </Box>
                  </Tooltip>
                </TableCell>
                {isVisible("vendor_name") && <TableCell
                  sx={{
                    ...getCellStyle(row),
                    backgroundColor:
                      sortConfig.key === "vendor_name" ? "background.surface" : "inherit",
                  }}
                >
                  {
                    formattedVendors?.find(
                      (vendor: { _id: number; name: string }) =>
                        vendor._id === row.vendor_id
                    )?.name
                  }
                </TableCell>}
                {isVisible("project_titles") && <TableCell
                  sx={{
                    ...getCellStyle(row),
                    maxWidth: 200,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    backgroundColor:
                      sortConfig.key === "project_titles"
                        ? "background.surface"
                        : "inherit",
                  }}
                >
                  {(() => {
                    // Check if project_titles is empty or contains only empty strings
                    const projectTitles = row.project_titles as string;
                    if (
                      !projectTitles ||
                      projectTitles.trim() === "" ||
                      projectTitles === "null"
                    ) {
                      return (
                        <span style={{ color: "#888", fontStyle: "normal" }}>
                          -
                        </span>
                      );
                    }

                    const projects = projectTitles
                      .split(",")
                      .map((p) => p.trim())
                      .filter((p) => p !== "" && p !== "null"); // Filter out empty strings and 'null'

                    // If no valid projects after filtering, show dash
                    if (projects.length === 0) {
                      return (
                        <span style={{ color: "#888", fontStyle: "normal" }}>
                          -
                        </span>
                      );
                    }

                    const displayCount = 1;
                    const showMore = projects.length > displayCount;
                    const displayed = projects
                      .slice(0, displayCount)
                      .join(", ");
                    const moreCount = projects.length - displayCount;
                    return (
                      <Tooltip
                        title={
                          <>
                            {projects.map((title, idx) => (
                              <div key={idx}>{title}</div>
                            ))}
                          </>
                        }
                        arrow
                        placement="top"
                        sx={{ fontSize: 13 }}
                      >
                        <Box
                          component="span"
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            cursor: "pointer",
                            width: "100%",
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 150,
                              display: "inline-block",
                              verticalAlign: "middle",
                            }}
                          >
                            {displayed}
                          </span>
                          {showMore && (
                            <span
                              style={{
                                color: "#888",
                                marginLeft: 4,
                                fontWeight: 500,
                              }}
                            >
                              +{moreCount}
                            </span>
                          )}
                        </Box>
                      </Tooltip>
                    );
                  })()}
                </TableCell>}
                {isVisible("action_owner") && <TableCell
                  sx={{
                    ...getCellStyle(row),
                    backgroundColor:
                      sortConfig.key === "action_owner" ? "background.surface" : "inherit",
                  }}
                >
                  {
                    formattedUsers?.find(
                      (user: { _id: number; name: string }) =>
                        user._id === row.action_owner
                    )?.name
                  }
                </TableCell>}
                {isVisible("risk_severity") && <TableCell
                  sx={{
                    ...getCellStyle(row),
                    backgroundColor:
                      sortConfig.key === "risk_severity"
                        ? "background.surface"
                        : "inherit",
                  }}
                >
                  {row.risk_severity ? <Chip label={row.risk_severity} /> : "-"}
                </TableCell>}
                {isVisible("risk_level") && <TableCell
                  sx={{
                    ...getCellStyle(row),
                    backgroundColor:
                      sortConfig.key === "risk_level" ? "background.surface" : "inherit",
                  }}
                >
                  <VWLink
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(row.risk_id!);
                    }}
                    showUnderline={false}
                    showIcon={false}
                  >
                    {row.risk_level}
                  </VWLink>
                </TableCell>}
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    minWidth: "80px",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <ViewRelationshipsButton
                      entityId={(row.risk_id || 0) + 200000}
                      entityType="risk"
                      entityLabel={row.risk_description?.substring(0, 30) || undefined}
                    />
                    {isDeletingAllowed && (
                      <IconButton
                        id={row.risk_id!}
                        onDelete={() => onDelete(row.risk_id!)}
                        onEdit={() => onEdit(row.risk_id!)}
                        onMouseEvent={() => {}}
                        warningTitle="Delete this risk?"
                        warningMessage="This action is non-recoverable."
                        type="Risk"
                      />
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    ),
    [
      sortedRisks,
      page,
      rowsPerPage,
      cellStyle,
      dropdownAnchor,
      handleDropdownClose,
      formattedUsers,
      formattedVendors,
      getCellStyle,
      isDeletingAllowed,
      onDelete,
      onEdit,
      theme.palette.action?.hover,
      hidePagination,
      sortConfig.key,
      isVisible,
    ]
  );

  return (
    <>
      {/* Empty state outside the table */}
      {!vendorRisks || vendorRisks.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          message="No risks identified yet. Document and track risks related to your AI systems."
          showBorder
        >
          <EmptyStateTip
            icon={TrendingDown}
            title="Identify AI-specific risks"
            description="Document risks related to bias, data quality, security, transparency, and model drift. Cover both technical and organizational risks."
          />
          <EmptyStateTip
            icon={Grid3X3}
            title="Assess likelihood and impact"
            description="Rate each risk by likelihood and impact. The risk score and level help you prioritize what needs attention first."
          />
          <EmptyStateTip
            icon={ListChecks}
            title="Create treatment plans"
            description="Define mitigation strategies for each risk and track their progress. Link treatments to specific controls for full traceability."
          />
        </EmptyState>
      ) : (
        <TableContainer>
          <Table sx={{ ...singleTheme.tableStyles.primary.frame }}>
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
                    Showing {getRange} of {sortedRisks?.length} vendor risk(s)
                  </TableCell>
                  <TablePagination
                    count={sortedRisks?.length}
                    page={page}
                    onPageChange={handleChangePage}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[5, 10, 15, 25]}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    ActionsComponent={(props) => (
                      <TablePaginationActions {...props} />
                    )}
                    labelRowsPerPage="Rows per page"
                    labelDisplayedRows={({ page, count }) =>
                      `Page ${page + 1} of ${Math.max(
                        0,
                        Math.ceil(count / rowsPerPage)
                      )}`
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
    </>
  );
};

export default RiskTable;
