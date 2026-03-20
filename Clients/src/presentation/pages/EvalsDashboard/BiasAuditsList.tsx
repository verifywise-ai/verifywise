import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Stack,
  Typography,
  IconButton,
  CircularProgress,
  Alert,
  useTheme,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Box,
} from "@mui/material";
import { Trash2, Eye, ChevronsUpDown, ChevronUp, ChevronDown, Scale, Users, BarChart3, FileText } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import SearchBox from "../../components/Search/SearchBox";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { PageHeader } from "../../components/Layout/PageHeader";
import HelperIcon from "../../components/HelperIcon";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import NewBiasAuditModal from "./NewBiasAuditModal";
import { getStatusChip, getModeChip, formatDate } from "./biasAuditHelpers";
import singleTheme from "../../themes/v1SingleTheme";
import { palette } from "../../themes/palette";
import {
  listBiasAudits,
  deleteBiasAudit,
  type BiasAuditSummary,
} from "../../../application/repository/deepEval.repository";

interface BiasAuditsListProps {
  orgId: string;
  onViewAudit: (auditId: string) => void;
}

type SortDirection = "asc" | "desc" | null;
type SortConfig = { key: string; direction: SortDirection };

const SORTING_KEY = "verifywise_bias_audits_sorting";

const columns = [
  { id: "framework", label: "FRAMEWORK", sortable: true, width: "25%" },
  { id: "mode", label: "MODE", sortable: true, width: "15%" },
  { id: "status", label: "STATUS", sortable: true, width: "15%" },
  { id: "result", label: "RESULT", sortable: true, width: "15%" },
  { id: "date", label: "DATE", sortable: true, width: "20%" },
  { id: "action", label: "ACTION", sortable: false, width: "60px" },
];

function getResultSummary(audit: BiasAuditSummary) {
  if (audit.status !== "completed" || !audit.results) return "—";
  const flags = audit.results.flags_count;
  if (flags === 0) return <Typography sx={{ fontSize: 13, color: palette.status.success.text }}>No flags</Typography>;
  return (
    <Typography sx={{ fontSize: 13, color: palette.status.error.text, fontWeight: 500 }}>
      {flags} flag{flags !== 1 ? "s" : ""}
    </Typography>
  );
}

function getSortValue(audit: BiasAuditSummary, key: string): string | number {
  switch (key) {
    case "framework":
      return audit.presetName.toLowerCase();
    case "mode":
      return audit.mode.toLowerCase();
    case "status":
      return audit.status.toLowerCase();
    case "result":
      if (audit.status !== "completed" || !audit.results) return -1;
      return audit.results.flags_count;
    case "date":
      return audit.createdAt ? new Date(audit.createdAt).getTime() : 0;
    default:
      return 0;
  }
}

export default function BiasAuditsList({ orgId, onViewAudit }: BiasAuditsListProps) {
  const theme = useTheme();
  const [audits, setAudits] = useState<BiasAuditSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [auditToDelete, setAuditToDelete] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    const saved = localStorage.getItem(SORTING_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.key && parsed.direction) return parsed;
      } catch { /* use default */ }
    }
    return { key: "date", direction: "desc" };
  });

  useEffect(() => {
    localStorage.setItem(SORTING_KEY, JSON.stringify(sortConfig));
  }, [sortConfig]);

  const handleSort = useCallback((columnId: string) => {
    setSortConfig((prev) => {
      if (prev.key === columnId) {
        if (prev.direction === "asc") return { key: columnId, direction: "desc" };
        if (prev.direction === "desc") return { key: "", direction: null };
      }
      return { key: columnId, direction: "asc" };
    });
  }, []);

  const fetchAudits = useCallback(async () => {
    try {
      const data = await listBiasAudits({ org_id: orgId });
      setAudits(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load bias audits:", err);
      setError("Failed to load bias audits");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const hasRunning = audits.some((a) => a.status === "running" || a.status === "pending");
    if (hasRunning && !pollingRef.current) {
      pollingRef.current = setInterval(fetchAudits, 5000);
    } else if (!hasRunning && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [audits, fetchAudits]);

  const handleDelete = async () => {
    if (!auditToDelete || deletingRef.current) return;
    deletingRef.current = true;
    try {
      await deleteBiasAudit(auditToDelete);
      setAudits((prev) => prev.filter((a) => a.id !== auditToDelete));
    } catch (err) {
      console.error("Failed to delete audit:", err);
      setError("Failed to delete audit. Please try again.");
    } finally {
      setAuditToDelete(null);
      deletingRef.current = false;
    }
  };

  const sortedAudits = useMemo(() => {
    const filtered = audits.filter((a) =>
      a.presetName.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (!sortConfig.key || !sortConfig.direction) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = getSortValue(a, sortConfig.key);
      const bVal = getSortValue(b, sortConfig.key);
      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal);
        return sortConfig.direction === "asc" ? cmp : -cmp;
      }
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [audits, searchQuery, sortConfig]);

  return (
    <Stack sx={{ width: "100%" }}>
      <PageHeader
        title="Bias audits"
        description="Run compliance-aware bias audits against demographic datasets"
        rightContent={<HelperIcon articlePath="llm-evals/bias-audits" />}
      />

      {/* Search + New bias audit button */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: "18px", mb: 3 }}>
        <Box sx={{ maxWidth: 320 }}>
          <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder="Search audits..." />
        </Box>
        <CustomizableButton
          variant="contained"
          text="New bias audit"
          onClick={() => setModalOpen(true)}
          sx={{
            backgroundColor: palette.brand.primary,
            border: `1px solid ${palette.brand.primary}`,
            gap: 2,
            "&:hover": {
              backgroundColor: palette.brand.primaryHover,
            },
          }}
        />
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2, fontSize: 13 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
        </Box>
      ) : sortedAudits.length === 0 ? (
        <EmptyState
          icon={Scale}
          message="No bias audits yet. Audit your models for fairness across demographic groups."
          showBorder
        >
          <EmptyStateTip
            icon={Users}
            title="Define demographic groups"
            description="Specify which groups to test: gender, age, ethnicity, language, or custom categories relevant to your application."
          />
          <EmptyStateTip
            icon={BarChart3}
            title="Measure disparate impact"
            description="The audit calculates performance differences across groups. See pass rates, accuracy gaps, and statistical significance scores."
          />
          <EmptyStateTip
            icon={FileText}
            title="Generate audit reports"
            description="Export detailed bias audit reports for compliance documentation. Results can be attached as evidence to your governance framework."
          />
        </EmptyState>
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={singleTheme.tableStyles.primary.frame}>
            <TableHead
              sx={{ backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors }}
            >
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                {columns.map((col) => {
                  const isActive = sortConfig.key === col.id;
                  return (
                    <TableCell
                      key={col.id}
                      sx={{
                        ...singleTheme.tableStyles.primary.header.cell,
                        width: col.width,
                        ...(col.id === "action" && { minWidth: "60px", maxWidth: "60px" }),
                        ...(col.sortable && {
                          cursor: "pointer",
                          userSelect: "none",
                          "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.04)" },
                        }),
                      }}
                      onClick={() => col.sortable && handleSort(col.id)}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: theme.spacing(2) }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            fontSize: "13px",
                            color: isActive ? "primary.main" : "inherit",
                          }}
                        >
                          {col.label}
                        </Typography>
                        {col.sortable && (
                          <Box sx={{ display: "flex", alignItems: "center", color: isActive ? "primary.main" : palette.text.disabled }}>
                            {isActive && sortConfig.direction === "asc" && <ChevronUp size={14} />}
                            {isActive && sortConfig.direction === "desc" && <ChevronDown size={14} />}
                            {!isActive && <ChevronsUpDown size={14} />}
                          </Box>
                        )}
                      </Box>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedAudits.map((audit) => (
                <TableRow
                  key={audit.id}
                  onClick={() => onViewAudit(audit.id)}
                  sx={{
                    ...singleTheme.tableStyles.primary.body.row,
                  }}
                >
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.primary }}>
                      {audit.presetName}
                    </Typography>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{getModeChip(audit.mode)}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{getStatusChip(audit.status)}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{getResultSummary(audit)}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      {formatDate(audit.createdAt)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell} onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        size="small"
                        onClick={() => onViewAudit(audit.id)}
                        sx={{ padding: 0.5 }}
                      >
                        <Eye size={16} strokeWidth={1.5} color={theme.palette.text.secondary} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => setAuditToDelete(audit.id)}
                        sx={{ padding: 0.5 }}
                      >
                        <Trash2 size={16} strokeWidth={1.5} color={theme.palette.text.secondary} />
                      </IconButton>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* New Bias Audit Modal */}
      <NewBiasAuditModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        orgId={orgId}
        onAuditCreated={(_auditId) => {
          setModalOpen(false);
          fetchAudits();
        }}
      />

      {/* Delete Confirmation Modal */}
      {!!auditToDelete && (
        <ConfirmationModal
          isOpen
          title="Delete bias audit"
          body="Are you sure you want to delete this bias audit? This action cannot be undone."
          proceedText="Delete"
          cancelText="Cancel"
          onProceed={handleDelete}
          onCancel={() => setAuditToDelete(null)}
          proceedButtonVariant="contained"
          proceedButtonColor="error"
        />
      )}
    </Stack>
  );
}
