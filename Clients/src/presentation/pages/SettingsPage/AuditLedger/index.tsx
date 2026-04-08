import { useMemo } from "react";
import { useAuth } from "../../../../application/hooks/useAuth";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  CircularProgress,
  Stack,
  useTheme,
  type SelectChangeEvent,
} from "@mui/material";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ChevronsUpDown,
  ClipboardList,
  FileSearch,
  Lock,
  Filter,
} from "lucide-react";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../../components/button/customizable-button";
import SearchBox from "../../../components/Search/SearchBox";
import Select from "../../../components/Inputs/Select";
import Toggle from "../../../components/Inputs/Toggle";
import { EmptyState } from "../../../components/EmptyState";
import InfoBox from "../../../components/InfoBox";
import Chip from "../../../components/Chip";
import TablePaginationActions from "../../../components/TablePagination";
import singleTheme from "../../../themes/v1SingleTheme";
import { useAuditLedger } from "./hooks/useAuditLedger";
import { useFeatureSettings } from "../../../../application/hooks/useFeatureSettings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SelectorVertical = (props: any) => (
  <ChevronsUpDown size={16} {...props} />
);

const ENTITY_TYPE_ITEMS = [
  { _id: "", name: "All entity types" },
  { _id: "vendor", name: "Vendor" },
  { _id: "vendor_risk", name: "Vendor risk" },
  { _id: "project_risk", name: "Project risk" },
  { _id: "policy", name: "Policy" },
  { _id: "incident", name: "Incident" },
  { _id: "use_case", name: "Use case" },
  { _id: "model_inventory", name: "Model inventory" },
  { _id: "file", name: "File" },
  { _id: "dataset", name: "Dataset" },
];

const ENTRY_TYPE_ITEMS = [
  { _id: "", name: "All entry types" },
  { _id: "event_log", name: "Event log" },
  { _id: "change_history", name: "Change history" },
];

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getUserDisplay(
  name: string | null,
  surname: string | null
): string {
  if (name || surname) {
    return `${name ?? ""} ${surname ?? ""}`.trim();
  }
  return "Unknown user";
}

export default function AuditLedger() {
  const theme = useTheme();
  const { isSuperAdmin } = useAuth();
  const { settings, isLoading: featureLoading, update: updateFeature } = useFeatureSettings();
  const isEnabled = settings?.audit_ledger_enabled ?? true;

  const handleToggle = async (checked: boolean) => {
    try {
      await updateFeature({ audit_ledger_enabled: checked });
    } catch {
      // error logged in hook
    }
  };

  const {
    entries,
    total,
    isLoading,
    filters,
    updateFilters,
    page,
    rowsPerPage,
    handleChangePage,
    handleChangeRowsPerPage,
    verify,
    verifyResult,
    isVerifying,
  } = useAuditLedger();

  const verifyBanner = useMemo(() => {
    if (!verifyResult) {
      return {
        icon: <ShieldQuestion size={18} strokeWidth={1.5} />,
        label: "Chain not yet verified — click 'Verify chain' to check integrity",
        color: theme.palette.text.accent,
        bg: theme.palette.background.alt,
      };
    }
    if (
      verifyResult.status === "intact" ||
      verifyResult.status === "partial"
    ) {
      const suffix =
        verifyResult.status === "partial"
          ? ` (verified ${verifyResult.totalEntries.toLocaleString()} entries)`
          : ` (${verifyResult.totalEntries.toLocaleString()} entries)`;
      return {
        icon: <ShieldCheck size={18} strokeWidth={1.5} />,
        label: `All entries verified — no tampering detected${suffix}`,
        color: theme.palette.status.success.text,
        bg: theme.palette.status.success.bg,
      };
    }
    if (verifyResult.status === "empty") {
      return {
        icon: <ShieldQuestion size={18} strokeWidth={1.5} />,
        label: "Ledger is empty",
        color: theme.palette.text.accent,
        bg: theme.palette.background.alt,
      };
    }
    return {
      icon: <ShieldAlert size={18} strokeWidth={1.5} />,
      label: verifyResult.brokenAtId
        ? `Tampering detected — hash chain broken at entry #${verifyResult.brokenAtId}. Entries at or before this point may have been altered.`
        : "Tampering detected — hash chain integrity check failed.",
      color: theme.palette.status.error.text,
      bg: theme.palette.status.error.bg,
    };
  }, [verifyResult, theme]);

  return (
    <Stack sx={{ gap: "16px" }}>
      {/* Enable/disable toggle */}
      <Box
        sx={{
          border: `1px solid ${theme.palette.border.light}`,
          borderRadius: "4px",
          p: "16px",
          backgroundColor: theme.palette.background.main,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
            Audit ledger
          </Typography>
          <Typography
            sx={{ fontSize: 13, color: theme.palette.text.secondary }}
          >
            Tamper-proof, hash-chained log of all platform changes for
            compliance auditing
          </Typography>
        </Box>
        <Toggle
          checked={isEnabled}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={featureLoading}
        />
      </Box>

      {/* Status message */}
      {!isEnabled && (
        <Typography
          sx={{
            fontSize: 13,
            color: theme.palette.text.accent,
            backgroundColor: theme.palette.background.alt,
            border: `1px solid ${theme.palette.border.light}`,
            borderRadius: "4px",
            px: "16px",
            py: "12px",
          }}
        >
          The audit ledger is currently disabled. New platform changes will not
          be recorded. Existing entries are preserved and can still be verified
          once the ledger is re-enabled.
        </Typography>
      )}

      {/* Info box */}
      {isEnabled && (
        <InfoBox
          header="Tamper-proof audit ledger"
          message="Every change made on the platform is recorded as an append-only, hash-chained entry. Each entry's cryptographic hash depends on the previous one, so any modification or deletion would break the chain. Click 'Verify chain' to confirm that no entries have been altered or removed since they were recorded."
          storageKey="audit-ledger-info"
          variant="info"
          backgroundColor="linear-gradient(135deg, #EFF6FF 0%, #F8FBFF 100%)"
          borderColor="#DBEAFE"
        />
      )}

      {/* Ledger content — shown only when enabled */}
      {isEnabled && (
        <>
          {/* Verification banner */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              px: "16px",
              py: "12px",
              borderRadius: "4px",
              border: `1px solid ${theme.palette.border.light}`,
              backgroundColor: verifyBanner.bg,
            }}
          >
            <Stack direction="row" alignItems="center" sx={{ gap: "8px" }}>
              <Box sx={{ color: verifyBanner.color, display: "flex" }}>
                {verifyBanner.icon}
              </Box>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: verifyBanner.color,
                }}
              >
                {verifyBanner.label}
              </Typography>
            </Stack>
            <CustomizableButton
              text={isVerifying ? "Verifying..." : "Verify chain"}
              variant="contained"
              onClick={verify}
              isDisabled={isVerifying || isSuperAdmin}
              sx={{ height: 34, minWidth: 120 }}
            />
          </Stack>

          {/* Filters row */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Stack direction="row" alignItems="center" sx={{ gap: "8px" }}>
              <Select
                id="audit-entity-type"
                placeholder="All entity types"
                value={filters.entity_type}
                items={ENTITY_TYPE_ITEMS}
                onChange={(e: SelectChangeEvent<string | number>) =>
                  updateFilters({ entity_type: String(e.target.value) })
                }
                sx={{ minWidth: 170 }}
              />
              <Select
                id="audit-entry-type"
                placeholder="All entry types"
                value={filters.entry_type}
                items={ENTRY_TYPE_ITEMS}
                onChange={(e: SelectChangeEvent<string | number>) =>
                  updateFilters({ entry_type: String(e.target.value) })
                }
                sx={{ minWidth: 160 }}
              />
              <SearchBox
                value={filters.searchUser}
                onChange={(val: string) => updateFilters({ searchUser: val })}
                placeholder="Search user..."
                fullWidth={false}
              />
            </Stack>
          </Stack>

          {/* Table */}
          {isLoading ? (
            <Stack alignItems="center" sx={{ py: "64px" }}>
              <CircularProgress size={28} />
            </Stack>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              message="No audit ledger entries found."
              showBorder
            >
              <EmptyStateTip
                icon={FileSearch}
                title="What gets logged?"
                description="Every create, update, and delete action across your workspace is recorded here with a timestamp, user, and entity reference."
              />
              <EmptyStateTip
                icon={Lock}
                title="Immutable records"
                description="Audit entries can't be edited or deleted. They provide a tamper-proof trail for compliance audits and internal reviews."
              />
              <EmptyStateTip
                icon={Filter}
                title="Filter and export"
                description="Use the filters above to narrow entries by action type, user, or entity. Export filtered results for audit reporting."
              />
            </EmptyState>
          ) : (
              <TableContainer sx={singleTheme.tableStyles.primary.frame}>
                <Table>
                  <TableHead>
                    <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                      <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Timestamp</TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.header.cell}>User</TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Action</TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Entity type</TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Entity ID</TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Entry type</TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.header.cell}>Hash</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id} sx={singleTheme.tableStyles.primary.body.row}>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          {formatTimestamp(entry.occurred_at)}
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          {getUserDisplay(entry.user_name, entry.user_surname)}
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          {entry.event_type ?? entry.action ?? "-"}
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          {entry.entity_type ?? "-"}
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          {entry.entity_id ?? "-"}
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <Chip
                            label={entry.entry_type === "event_log" ? "Event log" : "Change history"}
                            variant={entry.entry_type === "event_log" ? "info" : "warning"}
                            uppercase={false}
                          />
                        </TableCell>
                        <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                          <Tooltip title={entry.entry_hash.trim()} arrow>
                            <Typography
                              component="span"
                              sx={{
                                fontSize: 12,
                                fontFamily: "monospace",
                                color: theme.palette.text.accent,
                                cursor: "default",
                              }}
                            >
                              {entry.entry_hash.trim().slice(0, 12)}...
                            </Typography>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
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
                          fontSize: 13,
                          opacity: 0.7,
                        }}
                      >
                        {filters.searchUser
                          ? `Showing ${entries.length} matching of ${total.toLocaleString()} entries`
                          : `Showing ${Math.min(page * rowsPerPage + 1, total)}–${Math.min((page + 1) * rowsPerPage, total)} of ${total.toLocaleString()} entries`}
                      </TableCell>
                      <TablePagination
                        count={total}
                        page={page}
                        onPageChange={handleChangePage}
                        rowsPerPage={rowsPerPage}
                        rowsPerPageOptions={[5, 10, 15, 25, 50]}
                        onRowsPerPageChange={handleChangeRowsPerPage}
                        ActionsComponent={(props) => (
                          <TablePaginationActions {...props} />
                        )}
                        labelRowsPerPage="Rows per page"
                        labelDisplayedRows={({ page: p, count }) =>
                          `Page ${p + 1} of ${Math.max(
                            1,
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
                </Table>
              </TableContainer>
          )}
        </>
      )}
    </Stack>
  );
}
