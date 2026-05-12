import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Collapse,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { History, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import Chip from "../../../components/Chip";
import { friaRepository } from "../../../../application/repository/fria.repository";
import { brand } from "../../../themes/palette";

interface FriaVersionSnapshot {
  id: number;
  fria_id: number;
  version: number;
  snapshot_reason: string | null;
  created_by_name: string | null;
  created_at: string;
  snapshot_data: Record<string, unknown> | null;
}

interface FriaVersionHistoryProps {
  friaId: number;
  currentVersion: number;
  inline?: boolean;
}

interface FieldDiff {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
  type: "changed" | "added" | "removed";
}

// Human-readable labels for FRIA assessment fields
const FIELD_LABELS: Record<string, string> = {
  assessment_owner: "Assessment owner",
  assessment_date: "Assessment date",
  operational_context: "Operational context",
  is_high_risk: "High-risk classification",
  high_risk_basis: "High-risk basis",
  deployer_type: "Deployer type",
  annex_iii_category: "Annex III category",
  first_use_date: "First use date",
  review_cycle: "Review cycle",
  period_frequency: "Period frequency",
  fria_rationale: "FRIA rationale",
  affected_groups: "Affected groups",
  vulnerability_context: "Vulnerability context",
  group_flags: "Group flags",
  risk_scenarios: "Risk scenarios",
  provider_info_used: "Provider info used",
  human_oversight: "Human oversight",
  transparency_measures: "Transparency measures",
  redress_process: "Redress process",
  data_governance: "Data governance",
  legal_review: "Legal review",
  dpo_review: "DPO review",
  owner_approval: "Owner approval",
  stakeholders_consulted: "Stakeholders consulted",
  consultation_notes: "Consultation notes",
  deployment_decision: "Deployment decision",
  decision_conditions: "Decision conditions",
  status: "Status",
  completion_pct: "Completion %",
  risk_score: "Risk score",
  risk_level: "Risk level",
  rights_flagged: "Rights flagged",
};

// Fields to skip in diff (metadata, IDs)
const SKIP_FIELDS = new Set([
  "id",
  "project_id",
  "organization_id",
  "version",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "created_by_name",
  "updated_by_name",
  "project_title",
  "organization_name",
]);

// Fields that contain ISO date strings
const DATE_FIELDS = new Set(["assessment_date", "first_use_date"]);

function formatDateValue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })} ${d.getFullYear()}`;
}

function formatValue(value: unknown, fieldKey?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const str = String(value);
  if (fieldKey && DATE_FIELDS.has(fieldKey) && str.includes("T")) {
    return formatDateValue(str);
  }
  return str;
}

function computeDiffs(
  oldAssessment: Record<string, unknown> | null,
  newAssessment: Record<string, unknown>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  for (const [key, newVal] of Object.entries(newAssessment)) {
    if (SKIP_FIELDS.has(key)) continue;

    const oldVal = oldAssessment ? oldAssessment[key] : undefined;
    const oldStr = formatValue(oldVal, key);
    const newStr = formatValue(newVal, key);

    if (oldStr === newStr) continue;

    const label = FIELD_LABELS[key] || key;

    if (!oldAssessment || oldStr === "—") {
      if (newStr !== "—") {
        diffs.push({ field: key, label, oldValue: oldStr, newValue: newStr, type: "added" });
      }
    } else if (newStr === "—") {
      diffs.push({ field: key, label, oldValue: oldStr, newValue: newStr, type: "removed" });
    } else {
      diffs.push({ field: key, label, oldValue: oldStr, newValue: newStr, type: "changed" });
    }
  }

  return diffs;
}

function computeRightsDiffs(
  oldRights: Record<string, unknown>[] | null,
  newRights: Record<string, unknown>[],
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  for (const newRight of newRights) {
    const key = newRight.right_key as string;
    const title = (newRight.right_title as string) || key;
    const oldRight = oldRights?.find((r) => r.right_key === key) as
      | Record<string, unknown>
      | undefined;

    const newFlagged = Boolean(newRight.flagged);
    const oldFlagged = oldRight ? Boolean(oldRight.flagged) : false;

    if (newFlagged !== oldFlagged) {
      diffs.push({
        field: `right_${key}_flagged`,
        label: `${title} (flagged)`,
        oldValue: oldFlagged ? "Yes" : "No",
        newValue: newFlagged ? "Yes" : "No",
        type: "changed",
      });
    }

    const newSeverity = String(newRight.severity || 0);
    const oldSeverity = oldRight ? String(oldRight.severity || 0) : "0";
    if (newSeverity !== oldSeverity) {
      diffs.push({
        field: `right_${key}_severity`,
        label: `${title} (severity)`,
        oldValue: oldSeverity,
        newValue: newSeverity,
        type: "changed",
      });
    }
  }

  return diffs;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "short" });
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

const FriaVersionHistory = ({
  friaId,
  currentVersion,
  inline = false,
}: FriaVersionHistoryProps) => {
  const theme = useTheme();

  const [panelOpen, setPanelOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [versions, setVersions] = useState<FriaVersionSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inline && !panelOpen) return;

    const fetchVersions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await friaRepository.getVersions(friaId);
        setVersions(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load version history");
      } finally {
        setIsLoading(false);
      }
    };

    fetchVersions();
  }, [inline, panelOpen, friaId, currentVersion]);

  const handleRowToggle = (id: number) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  const getAllDiffsForVersion = (snapshot: FriaVersionSnapshot): FieldDiff[] => {
    if (!snapshot.snapshot_data) return [];

    const assessment = snapshot.snapshot_data.assessment as Record<string, unknown> | undefined;
    if (!assessment) return [];

    // Find the previous version's snapshot
    const sortedVersions = [...versions].sort((a, b) => a.version - b.version);
    const currentIndex = sortedVersions.findIndex((v) => v.id === snapshot.id);
    const previousSnapshot = currentIndex > 0 ? sortedVersions[currentIndex - 1] : null;

    const previousAssessment =
      (previousSnapshot?.snapshot_data?.assessment as Record<string, unknown> | null) ?? null;
    const assessmentDiffs = computeDiffs(previousAssessment, assessment);

    // Rights diffs
    const newRights = (snapshot.snapshot_data.rights || []) as Record<string, unknown>[];
    const oldRights = (previousSnapshot?.snapshot_data?.rights || null) as
      | Record<string, unknown>[]
      | null;
    const rightsDiffs = computeRightsDiffs(oldRights, newRights);

    // Risk items count change
    const newRiskCount = ((snapshot.snapshot_data.riskItems || []) as unknown[]).length;
    const oldRiskCount = previousSnapshot
      ? ((previousSnapshot.snapshot_data?.riskItems || []) as unknown[]).length
      : 0;
    const riskCountDiffs: FieldDiff[] = [];
    if (newRiskCount !== oldRiskCount) {
      riskCountDiffs.push({
        field: "risk_items_count",
        label: "Risk items",
        oldValue: previousSnapshot ? String(oldRiskCount) : "—",
        newValue: String(newRiskCount),
        type: newRiskCount > oldRiskCount ? "added" : "changed",
      });
    }

    return [...assessmentDiffs, ...rightsDiffs, ...riskCountDiffs];
  };

  const renderDiffTable = (diffs: FieldDiff[], isFirstVersion: boolean) => {
    if (diffs.length === 0) {
      return (
        <Box sx={{ padding: "12px" }}>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            {isFirstVersion
              ? "Initial snapshot with no fields filled."
              : "No changes from previous version."}
          </Typography>
        </Box>
      );
    }

    return (
      <Table size="small" sx={{ "& td, & th": { borderColor: "#e0e4e9" } }}>
        <TableHead>
          <TableRow sx={{ backgroundColor: "#fff" }}>
            <TableCell
              sx={{
                fontSize: 11,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                textTransform: "uppercase",
                padding: "6px 12px",
                width: "30%",
              }}
            >
              Field
            </TableCell>
            {!isFirstVersion && (
              <TableCell
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: "uppercase",
                  padding: "6px 12px",
                  width: "35%",
                }}
              >
                Previous
              </TableCell>
            )}
            <TableCell
              sx={{
                fontSize: 11,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                textTransform: "uppercase",
                padding: "6px 12px",
                width: isFirstVersion ? "70%" : "35%",
              }}
            >
              {isFirstVersion ? "Value" : "Updated"}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {diffs.map((diff) => (
            <TableRow key={diff.field}>
              <TableCell
                sx={{
                  fontSize: 12,
                  color: theme.palette.text.primary,
                  padding: "6px 12px",
                  fontWeight: 500,
                  verticalAlign: "top",
                }}
              >
                {diff.label}
              </TableCell>
              {!isFirstVersion && (
                <TableCell
                  sx={{
                    fontSize: 12,
                    padding: "6px 12px",
                    color: diff.type === "removed" ? "#d32f2f" : theme.palette.text.secondary,
                    backgroundColor: diff.type === "removed" ? "#fef2f2" : "transparent",
                    textDecoration: diff.type === "changed" ? "line-through" : "none",
                    verticalAlign: "top",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {diff.oldValue}
                </TableCell>
              )}
              <TableCell
                sx={{
                  fontSize: 12,
                  padding: "6px 12px",
                  color: diff.type === "removed" ? theme.palette.text.secondary : brand.primary,
                  backgroundColor: diff.type === "removed" ? "transparent" : "#f0fdf4",
                  fontWeight: diff.type !== "removed" ? 500 : 400,
                  verticalAlign: "top",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {diff.newValue}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  const renderContent = () => (
    <>
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {error && (
        <Box sx={{ padding: "16px" }}>
          <Typography sx={{ fontSize: 13, color: theme.palette.error.main }}>{error}</Typography>
        </Box>
      )}

      {!isLoading && !error && versions.length === 0 && (
        <Box sx={{ padding: "24px 16px" }}>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            No snapshots saved yet. Use "Save snapshot" to create one.
          </Typography>
        </Box>
      )}

      {!isLoading && !error && versions.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow
              sx={{
                backgroundColor: "#f9fafb",
                borderTop: inline ? "none" : "1px solid #d0d5dd",
              }}
            >
              <TableCell
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: "uppercase",
                  padding: "8px 16px",
                }}
              >
                Version
              </TableCell>
              <TableCell
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: "uppercase",
                  padding: "8px 16px",
                }}
              >
                Note
              </TableCell>
              <TableCell
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: "uppercase",
                  padding: "8px 16px",
                }}
              >
                Saved by
              </TableCell>
              <TableCell
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.palette.text.secondary,
                  textTransform: "uppercase",
                  padding: "8px 16px",
                }}
              >
                Date
              </TableCell>
              <TableCell sx={{ width: 36, padding: "8px" }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {versions.map((v, index) => {
              const isCurrent = v.version === currentVersion;
              const isRowExpanded = expandedRow === v.id;
              const isFirstVersion = index === versions.length - 1;
              const diffs = isRowExpanded ? getAllDiffsForVersion(v) : [];

              return (
                <React.Fragment key={v.id}>
                  <TableRow
                    onClick={() => v.snapshot_data && handleRowToggle(v.id)}
                    hover={!!v.snapshot_data}
                    sx={{
                      cursor: v.snapshot_data ? "pointer" : "default",
                    }}
                  >
                    <TableCell sx={{ padding: "10px 16px" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Chip
                          label={`v${v.version}`}
                          variant="info"
                          size="small"
                          uppercase={false}
                        />
                        {isCurrent && (
                          <Chip label="Current" variant="success" size="small" uppercase={false} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 13,
                        color: theme.palette.text.primary,
                        padding: "10px 16px",
                        maxWidth: 300,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.snapshot_reason || "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 13,
                        color: theme.palette.text.secondary,
                        padding: "10px 16px",
                      }}
                    >
                      {v.created_by_name || "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: 13,
                        color: theme.palette.text.secondary,
                        padding: "10px 16px",
                      }}
                    >
                      {v.created_at ? formatTimestamp(v.created_at) : "—"}
                    </TableCell>
                    <TableCell sx={{ width: 36, padding: "10px 8px", textAlign: "center" }}>
                      {v.snapshot_data && (
                        <Box
                          sx={{
                            color: theme.palette.text.secondary,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "transform 0.15s ease",
                            transform: isRowExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          }}
                        >
                          <ChevronRight size={14} strokeWidth={1.5} />
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Expanded diff view */}
                  {isRowExpanded && v.snapshot_data && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ padding: 0 }}>
                        <Box
                          sx={{
                            backgroundColor: "#f9fafb",
                            padding: "12px 16px",
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginBottom: "8px",
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: theme.palette.text.secondary,
                              }}
                            >
                              {isFirstVersion ? "Snapshot values" : "Changes from previous version"}
                            </Typography>
                            {diffs.length > 0 && (
                              <Chip
                                label={`${diffs.length} ${diffs.length === 1 ? "change" : "changes"}`}
                                variant="info"
                                size="small"
                                uppercase={false}
                              />
                            )}
                          </Box>
                          <Box
                            sx={{
                              backgroundColor: "#fff",
                              border: "1px solid #d0d5dd",
                              borderRadius: "4px",
                              overflow: "hidden",
                              maxHeight: 320,
                              overflowY: "auto",
                            }}
                          >
                            {renderDiffTable(diffs, isFirstVersion)}
                          </Box>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );

  if (inline) {
    return renderContent();
  }

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: "#d0d5dd",
        borderRadius: "4px",
        boxShadow: "none",
        overflow: "hidden",
      }}
    >
      <Box
        onClick={() => setPanelOpen((prev) => !prev)}
        sx={{
          "display": "flex",
          "alignItems": "center",
          "justifyContent": "space-between",
          "padding": "14px 16px",
          "cursor": "pointer",
          "userSelect": "none",
          "backgroundColor": theme.palette.background.paper,
          "&:hover": {
            backgroundColor: theme.palette.action.hover,
          },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <History size={16} strokeWidth={1.5} color={theme.palette.text.secondary} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
            Version history
          </Typography>
        </Box>
        {panelOpen ? (
          <ChevronUp size={16} strokeWidth={1.5} color={theme.palette.text.secondary} />
        ) : (
          <ChevronDown size={16} strokeWidth={1.5} color={theme.palette.text.secondary} />
        )}
      </Box>

      <Collapse in={panelOpen} timeout="auto" unmountOnExit>
        <CardContent sx={{ "padding": 0, "&:last-child": { paddingBottom: 0 } }}>
          {renderContent()}
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default FriaVersionHistory;
