import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  useTheme,
  Box,
  Tooltip,
  Stack,
} from "@mui/material";
import { useCallback, useMemo } from "react";
import singleTheme from "../../../themes/v1SingleTheme";
import { EmptyState } from "../../EmptyState";
import EmptyStateTip from "../../EmptyState/EmptyStateTip";
import IconButton from "../../IconButton";
import ViewRelationshipsButton from "../../ViewRelationshipsButton";
import Chip from "../../Chip";
import { ShieldAlert, TrendingDown, Grid3X3, ListChecks } from "lucide-react";
import { VendorRisk } from "../../../../domain/types/VendorRisk";
import { User } from "../../../../domain/types/User";
import { IRiskTableProps } from "../../../types/interfaces/i.table";
import { VWLink } from "../../Link";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import type { StandardColumn } from "../../../../domain/types/standardTable";

const titleOfTableColumns: StandardColumn[] = [
  { id: "risk_description", label: "risk description", sortable: true },
  { id: "vendor_name", label: "vendor", sortable: true },
  { id: "project_titles", label: "use case", sortable: true },
  { id: "action_owner", label: "action owner", sortable: true },
  { id: "risk_severity", label: "risk severity", sortable: true },
  { id: "risk_level", label: "risk level", sortable: true },
  { id: "actions", label: " ", sortable: false },
];

type EnrichedRisk = VendorRisk & { project_titles: string; vendor_name?: string };

const getSeverityValue = (severity: string): number => {
  const s = severity.toLowerCase();
  if (s.includes("catastrophic")) return 6;
  if (s.includes("critical")) return 5;
  if (s.includes("major")) return 4;
  if (s.includes("moderate")) return 3;
  if (s.includes("minor")) return 2;
  if (s.includes("negligible")) return 1;
  return 0;
};

const getLikelihoodValue = (likelihood: string): number => {
  const l = likelihood.toLowerCase();
  if (l.includes("almost certain")) return 5;
  if (l.includes("likely")) return 4;
  if (l.includes("possible")) return 3;
  if (l.includes("unlikely")) return 2;
  if (l.includes("rare")) return 1;
  return 0;
};

const getRiskLevelValue = (riskLevel: string): number => {
  const r = riskLevel.toLowerCase();
  if (r.includes("high") || r.includes("critical")) return 3;
  if (r.includes("medium") || r.includes("moderate")) return 2;
  if (r.includes("low") || r.includes("minor")) return 1;
  return 0;
};

function riskSortComparator(a: EnrichedRisk, b: EnrichedRisk, key: string): number {
  switch (key) {
    case "risk_description":
      return (a.risk_description?.toLowerCase() || "").localeCompare(
        b.risk_description?.toLowerCase() || ""
      );
    case "vendor_name":
      return (a.vendor_name?.toLowerCase() || "").localeCompare(
        b.vendor_name?.toLowerCase() || ""
      );
    case "project_titles":
      return (a.project_titles?.toLowerCase() || "").localeCompare(
        b.project_titles?.toLowerCase() || ""
      );
    case "action_owner":
      return (a.action_owner || 0) - (b.action_owner || 0);
    case "risk_severity":
      return getSeverityValue(a.risk_severity) - getSeverityValue(b.risk_severity);
    case "likelihood":
      return getLikelihoodValue(a.likelihood) - getLikelihoodValue(b.likelihood);
    case "risk_level":
      return getRiskLevelValue(a.risk_level) - getRiskLevelValue(b.risk_level);
    default:
      return 0;
  }
}

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

  // Group risks by id so each risk appears only once, and collect all project titles
  const uniqueRisks = useMemo(() => {
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
    return Object.values(groupedRisks).map((risk) => ({
      ...risk,
      project_titles: Array.from(new Set(risk.project_titles)).join(", "),
    }));
  }, [vendorRisks]);

  const {
    sortConfig,
    handleSort,
    sortedRows,
    validPage,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    getRange,
    totalCount,
  } = useStandardTable<EnrichedRisk>({
    rows: uniqueRisks,
    storageKey: "vendor_risks",
    defaultSortColumn: "",
    defaultSortDirection: null,
    defaultRowsPerPage: 5,
    sortComparator: riskSortComparator,
  });

  const tableBody = useMemo(
    () => (
      <TableBody>
        {sortedRows &&
          sortedRows
            .slice(
              hidePagination ? 0 : validPage * rowsPerPage,
              hidePagination
                ? Math.min(sortedRows.length, 100)
                : validPage * rowsPerPage + rowsPerPage
            )
            .map((row: EnrichedRisk) => (
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
      sortedRows,
      validPage,
      rowsPerPage,
      cellStyle,
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
            <StandardTableHead
              columns={visibleTableColumns}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
            {tableBody}
            {!hidePagination && (
              <StandardTablePagination
                totalCount={totalCount}
                page={validPage}
                rowsPerPage={rowsPerPage}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                getRange={getRange}
                entityLabel="vendor risk"
                colSpan={visibleTableColumns.length}
              />
            )}
          </Table>
        </TableContainer>
      )}
    </>
  );
};

export default RiskTable;
