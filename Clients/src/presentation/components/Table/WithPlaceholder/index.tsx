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
import { TableEmptyStateLayout } from "../TableEmptyStateLayout";
import singleTheme from "../../../themes/v1SingleTheme";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import TablePaginationActions from "../../TablePagination";
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Building2,
  ShieldCheck,
  FileSearch,
  AlertCircle,
  SearchX,
} from "lucide-react";
import VendorRisksDialog from "../../VendorRisksDialog";
import { useCanCheck } from "../../../../application/hooks/useCan";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import { User } from "../../../../domain/types/User";
import { ITableWithPlaceholderProps } from "../../../types/interfaces/i.table";
import { getRiskScoreColor } from "../../../../domain/utils/vendorScorecard.utils";
import { VWLink } from "../../Link";
import VendorLogo from "../../VendorLogo";
import { text, palette as vwPalette, radiusPx } from "../../../themes/palette";
import { useCustomFieldDefinitions } from "../../../../application/hooks/useCustomFields";
import { formatCustomFieldValue } from "../../CustomFieldsSection/formatCustomFieldValue";
import { pageOfLabel } from "../pageOfLabel";
import { vendorRiskCountByVendor } from "../../../../application/utils/vendorRiskRows";
import { compareVendors } from "../../../../application/utils/vendorSort";
import { buildUserSortNames } from "../../../../application/utils/userSort";
import { clampPage } from "../../../../application/utils/tablePage";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill, pluralKey } from "../../../../i18n/fill";

const VENDORS_ROWS_PER_PAGE_KEY = "verifywise_vendors_rows_per_page";
const VENDORS_SORTING_KEY = "verifywise_vendors_sorting";

type SortDirection = "asc" | "desc" | null;
type SortConfig = {
  key: string;
  direction: SortDirection;
};

const titleOfTableColumns = [
  { id: "vendor_name", label: "Name", sortable: true },
  { id: "assignee", label: "Assignee", sortable: true },
  { id: "review_status", label: "Status", sortable: true },
  { id: "risk", label: "Risks", sortable: true },
  { id: "scorecard", label: "Scorecard", sortable: true },
  { id: "review_date", label: "Review date", sortable: true },
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
                    "cursor": "pointer",
                    "userSelect": "none",
                    "&:hover": {
                      // One step darker than the header row (background.hover).
                      backgroundColor: "border.light",
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
  noMatchesMessage,
}) => {
  const formatDate = useFormattedDate();
  const theme = useTheme();
  const can = useCanCheck();
  const { t, lang } = useTranslation();
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

  // Distinct risks per vendor: the API repeats a risk once per use case.
  const riskCounts = useMemo(() => vendorRiskCountByVendor(vendorRisks), [vendorRisks]);
  const getVendorRiskCount = useCallback(
    (vendorId: number) => riskCounts.get(vendorId) ?? 0,
    [riskCounts],
  );
  const userSortNames = useMemo(() => buildUserSortNames(users ?? []), [users]);

  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  const isDeletingAllowed = can("vendor.edit");

  const isVisible = useCallback(
    (key: string) => {
      if (!visibleColumns) return true;
      return visibleColumns.has(key);
    },
    [visibleColumns],
  );

  const { data: customFieldDefs = [] } = useCustomFieldDefinitions("vendor");

  const visibleTableColumns = useMemo(() => {
    const builtIns = titleOfTableColumns.filter(
      (col) => col.id === "vendor_name" || col.id === "actions" || isVisible(col.id),
    );
    // Insert custom field columns between the last built-in non-actions column
    // (typically "review_date") and the "actions" column at the end.
    const actionsIdx = builtIns.findIndex((c) => c.id === "actions");
    const customCols = customFieldDefs.map((d) => ({
      id: `cf_${d.id}`,
      label: d.label,
      sortable: false,
    }));
    if (actionsIdx === -1) return [...builtIns, ...customCols];
    return [...builtIns.slice(0, actionsIdx), ...customCols, ...builtIns.slice(actionsIdx)];
  }, [isVisible, customFieldDefs]);

  const formatCfValue = useCallback(
    (def: { field_type: string; label?: string }, raw: unknown) =>
      formatCustomFieldValue(def, raw, users, formatDate),
    [users, formatDate],
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

    const direction = sortConfig.direction;
    return [...vendors].sort((a: VendorModel, b: VendorModel) =>
      compareVendors(a, b, sortConfig.key, direction, { userNames: userSortNames, riskCounts }),
    );
  }, [vendors, sortConfig, userSortNames, riskCounts]);

  // A filter or search can shrink the list below the current page: show the
  // last page that still has rows instead of an empty body.
  const validPage = clampPage(page, sortedVendors.length, rowsPerPage);
  useEffect(() => {
    if (page !== validPage) setPage(validPage);
  }, [page, validPage]);

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
    const start = validPage * rowsPerPage + 1;
    const end = Math.min(validPage * rowsPerPage + rowsPerPage, sortedVendors?.length ?? 0);
    return `${start} - ${end}`;
  }, [validPage, rowsPerPage, sortedVendors?.length]);

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedVendors &&
          sortedVendors
            .slice(
              hidePagination ? 0 : validPage * rowsPerPage,
              hidePagination
                ? Math.min(sortedVendors.length, 100)
                : validPage * rowsPerPage + rowsPerPage,
            )
            .map((row: VendorModel, index: number) => (
              <TableRow
                key={index}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  "cursor": "pointer",
                  "&:hover": {
                    backgroundColor: "background.surface",
                  },
                  "outline": "none",
                }}
                onClick={() => onEdit(row.id)}
              >
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                    backgroundColor:
                      sortConfig.key === "vendor_name"
                        ? vwPalette.border.light
                        : vwPalette.background.alt,
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
                          {fill(t(pluralKey(lang, riskCount, "{count} risk", "{count} risks")), {
                            count: riskCount,
                          })}
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
                    <Box display="flex" alignItems="center" gap="2px">
                      {(() => {
                        // The server computes risk_score; null means no scorecard answer.
                        const riskScore = row.risk_score;
                        if (riskScore === null || riskScore === undefined) {
                          return (
                            <Typography variant="body2" sx={{ color: "text.muted" }}>
                              Not assessed
                            </Typography>
                          );
                        }
                        const riskColor = getRiskScoreColor(riskScore);

                        return (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: "2px",
                              padding: "4px 8px",
                              borderRadius: radiusPx.sm,
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
                    {row.review_date ? formatDate(row.review_date.toString()) : "No review date"}
                  </TableCell>
                )}
                {customFieldDefs.map((def) => {
                  const match = row.custom_fields?.find((cf) => cf.definition_id === def.id);
                  return (
                    <TableCell key={`cf_${def.id}`} sx={cellStyle}>
                      {formatCfValue(def, match?.value)}
                    </TableCell>
                  );
                })}
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.body.cell,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Stack direction="row" alignItems="center" gap="1px">
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
      validPage,
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
      customFieldDefs,
      formatCfValue,
      formatDate,
      t,
      lang,
    ],
  );

  return (
    <>
      {!sortedVendors || sortedVendors.length === 0 ? (
        <TableEmptyStateLayout
          header={
            <SortableTableHead
              columns={visibleTableColumns}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
          }
        >
          {noMatchesMessage ? (
            <EmptyState icon={SearchX} message={noMatchesMessage} showBorder />
          ) : (
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
          )}
        </TableEmptyStateLayout>
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
                    {fill(
                      t(
                        pluralKey(
                          lang,
                          sortedVendors?.length ?? 0,
                          "Showing {range} of {total} vendor",
                          "Showing {range} of {total} vendors",
                        ),
                      ),
                      { range: getRange, total: sortedVendors?.length ?? 0 },
                    )}
                  </TableCell>
                  <TablePagination
                    count={sortedVendors?.length}
                    page={validPage}
                    onPageChange={handleChangePage}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[5, 10, 15, 25]}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    ActionsComponent={(props) => <TablePaginationActions {...props} />}
                    labelRowsPerPage="Rows per page"
                    labelDisplayedRows={({ page, count }) =>
                      pageOfLabel(page + 1, Math.max(0, Math.ceil(count / rowsPerPage)))
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
                          "ml": theme.spacing(4),
                          "mr": theme.spacing(12),
                          "minWidth": theme.spacing(20),
                          "textAlign": "left",
                          "&.Mui-focused > div": {
                            backgroundColor: theme.palette.background.main,
                          },
                        },
                      },
                    }}
                    sx={{
                      "mt": theme.spacing(6),
                      "color": theme.palette.text.secondary,
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
