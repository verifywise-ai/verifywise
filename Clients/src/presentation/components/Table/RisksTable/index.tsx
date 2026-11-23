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
import { TableEmptyStateLayout } from "../TableEmptyStateLayout";
import IconButton from "../../IconButton";
import ViewRelationshipsButton from "../../ViewRelationshipsButton";
import Chip from "../../Chip";
import { ShieldAlert, TrendingDown, Grid3X3, ListChecks, SearchX } from "lucide-react";
import { VendorRisk } from "../../../../domain/types/VendorRisk";
import { User } from "../../../../domain/types/User";
import { IRiskTableProps } from "../../../types/interfaces/i.table";
import { VWLink } from "../../Link";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import { useStandardTable } from "../../../../application/hooks/useStandardTable";
import StandardTableHead from "../StandardTableHead";
import StandardTablePagination from "../StandardTablePagination";
import type { StandardColumn } from "../../../../domain/types/standardTable";
import { useCustomFieldDefinitions } from "../../../../application/hooks/useCustomFields";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { formatCustomFieldValue } from "../../CustomFieldsSection/formatCustomFieldValue";
import { palette } from "../../../themes/palette";
import { distinctVendorRisks } from "../../../../application/utils/vendorRiskRows";
import { compareVendorRisks } from "../../../../application/utils/vendorSort";
import { buildUserSortNames } from "../../../../application/utils/userSort";

const titleOfTableColumns: StandardColumn[] = [
  { id: "risk_description", label: "risk description", sortable: true },
  { id: "vendor_name", label: "vendor", sortable: true },
  { id: "project_titles", label: "use case", sortable: true },
  { id: "action_owner", label: "action owner", sortable: true },
  { id: "risk_severity", label: "risk severity", sortable: true },
  { id: "risk_level", label: "risk level", sortable: true },
  { id: "inherited_by", label: "inherited by", sortable: true },
  { id: "actions", label: " ", sortable: false },
];

type EnrichedRisk = VendorRisk & {
  project_titles: string;
  vendor_name?: string;
  /** Confirmed child count from the exposure report; 0 when it has not loaded. */
  inherited_by: number;
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
  exposure,
  onOpenLinks,
  onRestore,
  noMatchesMessage,
}) => {
  const formatDate = useFormattedDate();
  const theme = useTheme();
  const { t } = useTranslation();
  const cellStyle = singleTheme.tableStyles.primary.body.cell;

  const isVisible = useCallback(
    (key: string) => {
      if (!visibleColumns) return true;
      return visibleColumns.has(key);
    },
    [visibleColumns],
  );

  const { data: customFieldDefs = [] } = useCustomFieldDefinitions("vendor_risk");

  const visibleTableColumns = useMemo(() => {
    const builtIns = titleOfTableColumns.filter(
      (col) => col.id === "risk_description" || col.id === "actions" || isVisible(col.id),
    );
    const customCols: StandardColumn[] = customFieldDefs.map((d) => ({
      id: `cf_${d.id}`,
      label: d.label,
      sortable: false,
    }));
    const actionsIdx = builtIns.findIndex((c) => c.id === "actions");
    if (actionsIdx === -1) return [...builtIns, ...customCols];
    return [...builtIns.slice(0, actionsIdx), ...customCols, ...builtIns.slice(actionsIdx)];
  }, [isVisible, customFieldDefs]);

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

  // Each risk once (the API sends a row per use case), with its use case titles.
  const uniqueRisks = useMemo(
    () =>
      distinctVendorRisks(vendorRisks).map((risk) => ({
        ...risk,
        project_titles: risk.project_titles.join(", "),
        inherited_by: exposure?.get(risk.risk_id!)?.children ?? 0,
      })),
    [vendorRisks, exposure],
  );

  // People sort by display name, not by user id.
  const userSortNames = useMemo(() => buildUserSortNames(users ?? []), [users]);
  const riskSortComparator = useCallback(
    (a: EnrichedRisk, b: EnrichedRisk, key: string, direction: "asc" | "desc") =>
      compareVendorRisks(a, b, key, userSortNames, direction),
    [userSortNames],
  );

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
                : validPage * rowsPerPage + rowsPerPage,
            )
            .map((row: EnrichedRisk) => (
              <TableRow
                key={row.risk_id}
                sx={{
                  ...singleTheme.tableStyles.primary.body.row,
                  ...(row.is_deleted && {
                    opacity: 0.7,
                    backgroundColor: theme.palette.action?.hover || palette.background.alt,
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
                        ? palette.border.light
                        : palette.background.alt,
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
                {isVisible("vendor_name") && (
                  <TableCell
                    sx={{
                      ...getCellStyle(row),
                      backgroundColor:
                        sortConfig.key === "vendor_name" ? "background.surface" : "inherit",
                    }}
                  >
                    {
                      formattedVendors?.find(
                        (vendor: { _id: number; name: string }) => vendor._id === row.vendor_id,
                      )?.name
                    }
                  </TableCell>
                )}
                {isVisible("project_titles") && (
                  <TableCell
                    sx={{
                      ...getCellStyle(row),
                      maxWidth: 200,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      backgroundColor:
                        sortConfig.key === "project_titles" ? "background.surface" : "inherit",
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
                          <span style={{ color: palette.text.accent, fontStyle: "normal" }}>-</span>
                        );
                      }

                      const projects = projectTitles
                        .split(",")
                        .map((p) => p.trim())
                        .filter((p) => p !== "" && p !== "null"); // Filter out empty strings and 'null'

                      // If no valid projects after filtering, show dash
                      if (projects.length === 0) {
                        return (
                          <span style={{ color: palette.text.accent, fontStyle: "normal" }}>-</span>
                        );
                      }

                      const displayCount = 1;
                      const showMore = projects.length > displayCount;
                      const displayed = projects.slice(0, displayCount).join(", ");
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
                                  color: palette.text.accent,
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
                  </TableCell>
                )}
                {isVisible("action_owner") && (
                  <TableCell
                    sx={{
                      ...getCellStyle(row),
                      backgroundColor:
                        sortConfig.key === "action_owner" ? "background.surface" : "inherit",
                    }}
                  >
                    {
                      formattedUsers?.find(
                        (user: { _id: number; name: string }) => user._id === row.action_owner,
                      )?.name
                    }
                  </TableCell>
                )}
                {isVisible("risk_severity") && (
                  <TableCell
                    sx={{
                      ...getCellStyle(row),
                      backgroundColor:
                        sortConfig.key === "risk_severity" ? "background.surface" : "inherit",
                    }}
                  >
                    {row.risk_severity ? <Chip label={row.risk_severity} /> : "-"}
                  </TableCell>
                )}
                {isVisible("risk_level") && (
                  <TableCell
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
                  </TableCell>
                )}
                {isVisible("inherited_by") && (
                  <TableCell
                    sx={{
                      ...getCellStyle(row),
                      backgroundColor:
                        sortConfig.key === "inherited_by" ? "background.surface" : "inherit",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const reach = exposure?.get(row.risk_id!);
                      if (reach && reach.children > 0) {
                        const label =
                          reach.children === 1
                            ? t("1 project risk")
                            : fill(t("{count} project risks"), { count: reach.children });
                        return (
                          <Tooltip
                            title={reach.use_cases.map((useCase) => useCase.name).join(", ")}
                            arrow
                          >
                            <span>
                              <VWLink
                                onClick={() => (onOpenLinks ?? onEdit)(row.risk_id!)}
                                showUnderline={false}
                                showIcon={false}
                              >
                                {label}
                              </VWLink>
                            </span>
                          </Tooltip>
                        );
                      }
                      if (reach && reach.suggested > 0) {
                        return fill(t("{count} suggested"), { count: reach.suggested });
                      }
                      return "-";
                    })()}
                  </TableCell>
                )}
                {customFieldDefs.map((def) => {
                  const match = (row as any).custom_fields?.find(
                    (cf: { definition_id: number; value: unknown }) => cf.definition_id === def.id,
                  );
                  return (
                    <TableCell key={`cf_${def.id}`} sx={getCellStyle(row)}>
                      {formatCustomFieldValue(def, match?.value, users, formatDate)}
                    </TableCell>
                  );
                })}
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
                        warningMessage="It moves to the deleted risks, where it can be restored."
                        type="Risk"
                        isArchived={row.is_deleted}
                        onView={() => onEdit(row.risk_id!)}
                        onRestore={onRestore ? () => onRestore(row.risk_id!) : undefined}
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
      exposure,
      onOpenLinks,
      onRestore,
      t,
      formatDate,
    ],
  );

  return (
    <>
      {/* Empty state outside the table */}
      {!vendorRisks || vendorRisks.length === 0 ? (
        <TableEmptyStateLayout
          header={
            <StandardTableHead
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
          )}
        </TableEmptyStateLayout>
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
