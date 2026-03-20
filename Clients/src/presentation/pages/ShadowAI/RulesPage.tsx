/**
 * Shadow AI Rules Page
 *
 * Manage alert rules and view alert history.
 * Tabs use URL-based routing: /shadow-ai/rules and /shadow-ai/rules/alerts
 */

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Stack,
  Typography,
  Paper,
  Skeleton,
  IconButton,
  SelectChangeEvent,
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  TableFooter,
  useTheme,
  FormControlLabel,
  Checkbox as MuiCheckbox,
} from "@mui/material";

const Alert = React.lazy(() => import("../../components/Alert"));
import Toggle from "../../components/Inputs/Toggle";
import Chip from "../../components/Chip";
import TabContext from "@mui/lab/TabContext";
import { Trash2, Info, ShieldCheck, Bell, Zap, Mail, Filter } from "lucide-react";
import TabBar from "../../components/TabBar";
import TablePaginationActions from "../../components/TablePagination";
import singleTheme from "../../themes/v1SingleTheme";
import {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  getAlertHistory,
} from "../../../application/repository/shadowAi.repository";
import { useAuth } from "../../../application/hooks/useAuth";
import {
  IShadowAiRule,
  IShadowAiAlertHistory,
  ShadowAiTriggerType,
} from "../../../domain/interfaces/i.shadowAi";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { CustomizableButton } from "../../components/button/customizable-button";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import {
  SelectorVertical,
  SortableColumn,
  useTableSort,
  useSortedRows,
  SortableTableHead,
} from "./constants";
import { palette } from "../../themes/palette";

const TRIGGER_LABELS: Record<ShadowAiTriggerType, string> = {
  new_tool_detected: "New tool detected",
  usage_threshold_exceeded: "Usage threshold exceeded",
  sensitive_department: "Sensitive department usage",
  blocked_attempt: "Blocked tool attempt",
  risk_score_exceeded: "Risk score exceeded",
  new_user_detected: "New user detected",
};

type ViewMode = "rules" | "history";

const ALERTS_PER_PAGE = 10;

const BASE_TABS = [
  { label: "Rules", value: "rules", icon: "Bell" as const, tooltip: "Configure alerts for Shadow AI activity" },
  { label: "Alert history", value: "history", icon: "History" as const, tooltip: "Past alerts triggered by your rules" },
];

export default function RulesPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const viewMode: ViewMode = location.pathname.includes("/rules/alerts")
    ? "history"
    : "rules";

  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<IShadowAiRule[]>([]);
  const [alerts, setAlerts] = useState<IShadowAiAlertHistory[]>([]);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [alertsPage, setAlertsPage] = useState(0);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IShadowAiRule | null>(null);
  const [toast, setToast] = useState<{ variant: "success" | "error"; body: string } | null>(null);

  // Create form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTrigger, setFormTrigger] = useState<ShadowAiTriggerType>("new_tool_detected");
  const [formActive, setFormActive] = useState(true);
  const [creating, setCreating] = useState(false);

  // Trigger-specific config fields
  const [formRiskScoreMin, setFormRiskScoreMin] = useState("70");
  const [formUsageThreshold, setFormUsageThreshold] = useState("100");
  const [formDepartments, setFormDepartments] = useState("");

  // Cooldown
  const [formCooldown, setFormCooldown] = useState("1440");

  // Notification
  const { userId } = useAuth();
  const [notifyMe, setNotifyMe] = useState(true);

  // Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // ─── Sorting ───
  const ALERTS_COLUMNS: SortableColumn[] = useMemo(() => [
    { id: "rule_name", label: "Rule" },
    { id: "trigger_type", label: "Trigger" },
    { id: "fired_at", label: "Fired at" },
  ], []);

  const { sortConfig: alertsSortConfig, handleSort: handleAlertsSort } =
    useTableSort("vw_shadow_ai_alerts_sort");

  const getAlertValue = useCallback(
    (row: IShadowAiAlertHistory, key: string): string | number => {
      switch (key) {
        case "rule_name": return row.rule_name || `Rule #${row.rule_id}`;
        case "trigger_type": return row.trigger_type || "";
        case "fired_at": return row.fired_at ? new Date(row.fired_at).getTime() : 0;
        default: return "";
      }
    }, []
  );

  const sortedAlerts = useSortedRows(alerts, alertsSortConfig, getAlertValue);

  const tabs = useMemo(() => BASE_TABS.map((tab) => ({
    ...tab,
    count: tab.value === "rules" ? rules.length : alertsTotal,
  })), [rules.length, alertsTotal]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toast]);

  // Fetch counts for both tabs on mount
  useEffect(() => {
    const controller = new AbortController();
    const fetchCounts = async () => {
      try {
        const [rulesData, alertsData] = await Promise.all([
          getRules(),
          getAlertHistory(1, 1),
        ]);
        if (controller.signal.aborted) return;
        setRules(rulesData);
        setAlertsTotal(alertsData.total);
      } catch {
        // counts will update when individual tabs load
      }
    };
    fetchCounts();
    return () => { controller.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      setLoading(true);
      try {
        if (viewMode === "rules") {
          const data = await getRules();
          if (controller.signal.aborted) return;
          setRules(data);
        } else {
          const data = await getAlertHistory(alertsPage + 1, ALERTS_PER_PAGE);
          if (controller.signal.aborted) return;
          setAlerts(data.alerts);
          setAlertsTotal(data.total);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load data:", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchData();
    return () => { controller.abort(); };
  }, [viewMode, alertsPage]);

  // Simple refetch for mutation handlers
  const fetchRules = async () => {
    try {
      const data = await getRules();
      setRules(data);
    } catch (error) {
      console.error("Failed to reload rules:", error);
    }
  };

  const handleTabChange = (_e: React.SyntheticEvent, newValue: string) => {
    if (newValue === "history") {
      navigate("/shadow-ai/rules/alerts");
    } else {
      navigate("/shadow-ai/rules");
    }
  };

  const handleToggleActive = async (rule: IShadowAiRule) => {
    try {
      const newState = !rule.is_active;
      await updateRule(rule.id, { is_active: newState });
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, is_active: newState } : r
        )
      );
      setToast({
        variant: "success",
        body: `Rule "${rule.name}" ${newState ? "enabled" : "disabled"} successfully`,
      });
    } catch (error) {
      console.error("Failed to toggle rule:", error);
      setToast({ variant: "error", body: "Failed to update rule" });
    }
  };

  const buildTriggerConfig = (): Record<string, unknown> => {
    switch (formTrigger) {
      case "risk_score_exceeded":
        return { risk_score_min: parseInt(formRiskScoreMin, 10) || 70 };
      case "usage_threshold_exceeded":
        return { event_count_threshold: parseInt(formUsageThreshold, 10) || 100 };
      case "sensitive_department":
        return {
          departments: formDepartments
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean),
        };
      default:
        return {};
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formName.trim()) {
      errors.name = "Rule name is required";
    }
    if (formTrigger === "risk_score_exceeded") {
      const val = parseInt(formRiskScoreMin, 10);
      if (isNaN(val) || val < 1 || val > 100) {
        errors.riskScoreMin = "Enter a value between 1 and 100";
      }
    }
    if (formTrigger === "usage_threshold_exceeded") {
      const val = parseInt(formUsageThreshold, 10);
      if (isNaN(val) || val < 1) {
        errors.usageThreshold = "Enter a positive number";
      }
    }
    if (formTrigger === "sensitive_department") {
      const depts = formDepartments.split(",").map((d) => d.trim()).filter(Boolean);
      if (depts.length === 0) {
        errors.departments = "Enter at least one department";
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    setCreating(true);
    try {
      const recipientIds = notifyMe && userId ? [userId] : [];
      await createRule({
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        is_active: formActive,
        trigger_type: formTrigger,
        trigger_config: buildTriggerConfig(),
        actions: [{ type: "send_alert" }],
        cooldown_minutes: parseInt(formCooldown, 10),
        notification_user_ids: recipientIds.length > 0 ? recipientIds : undefined,
      });
      setCreateModalOpen(false);
      resetForm();
      fetchRules();
      setToast({ variant: "success", body: "Rule created successfully" });
    } catch (error) {
      console.error("Failed to create rule:", error);
      setToast({ variant: "error", body: "Failed to create rule" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRule(deleteTarget.id);
      setDeleteTarget(null);
      fetchRules();
      setToast({ variant: "success", body: "Rule deleted successfully" });
    } catch (error) {
      console.error("Failed to delete rule:", error);
      setToast({ variant: "error", body: "Failed to delete rule" });
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormTrigger("new_tool_detected");
    setFormActive(true);
    setFormRiskScoreMin("70");
    setFormUsageThreshold("100");
    setFormDepartments("");
    setFormCooldown("1440");
    setNotifyMe(true);
    setFormErrors({});
  };

  const theme = useTheme();

  return (
    <PageHeaderExtended
      title="Rules"
      description="Configure alert rules to get notified about Shadow AI activity. Set triggers for new tool detection, usage thresholds, sensitive department usage, and more."

      helpArticlePath="shadow-ai/rules"
      tipBoxEntity="shadow-ai-rules"
      alert={
        toast ? (
          <Suspense fallback={null}>
            <Alert
              variant={toast.variant}
              body={toast.body}
              isToast={true}
              onClick={() => setToast(null)}
            />
          </Suspense>
        ) : undefined
      }
    >
      <TabContext value={viewMode}>

      {/* Controls */}
      <Stack sx={{ position: "relative" }}>
        <TabBar
          tabs={tabs}
          activeTab={viewMode}
          onChange={handleTabChange}
        />
        {viewMode === "rules" && (
          <CustomizableButton
            text="Create rule"
            variant="contained"
            sx={{
              backgroundColor: palette.brand.primary,
              "&:hover": { backgroundColor: palette.brand.primaryHover },
              height: 34,
              fontSize: 13,
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
            }}
            onClick={() => setCreateModalOpen(true)}
          />
        )}
      </Stack>

      {/* Content */}
      {loading ? (
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: "4px" }} />
      ) : viewMode === "rules" ? (
        rules.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            message="No rules configured yet. Create rules to automate alerts and enforce AI usage policies."
            showBorder
          >
            <EmptyStateTip
              icon={Zap}
              title="Trigger-based alerts"
              description="Set rules that fire when specific conditions are met: new tool detected, usage threshold exceeded, or data sensitivity flags triggered."
            />
            <EmptyStateTip
              icon={Mail}
              title="Notify the right people"
              description="Route alerts to security teams, managers, or compliance officers. Each rule can have different notification recipients."
            />
            <EmptyStateTip
              icon={Filter}
              title="Common rules to start with"
              description="Alert on first use of any new AI tool, flag tools accessing sensitive data, notify when usage exceeds a set threshold per department."
            />
          </EmptyState>
        ) : (
          <Stack gap="12px">
            {rules.map((rule) => (
              <Paper
                key={rule.id}
                elevation={0}
                sx={{
                  p: "16px",
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  opacity: rule.is_active ? 1 : 0.6,
                  transition: "opacity 0.2s ease",
                }}
              >
                <Stack gap="12px">
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Stack direction="row" alignItems="center" gap="8px">
                      <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
                        {rule.name}
                      </Typography>
                      <Chip
                        label={
                          TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type
                        }
                        size="small"
                        variant="info"
                        uppercase={false}
                      />
                    </Stack>
                    <Stack direction="row" alignItems="center" gap="4px">
                      <Toggle
                        checked={rule.is_active}
                        onChange={() => handleToggleActive(rule)}
                        size="small"
                      />
                      <IconButton
                        size="small"
                        onClick={() => setDeleteTarget(rule)}
                        sx={{ color: palette.status.error.text }}
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </IconButton>
                    </Stack>
                  </Stack>
                  {rule.description && (
                    <Typography sx={{ fontSize: 13, color: palette.status.default.text, lineHeight: 1.5 }}>
                      {rule.description}
                    </Typography>
                  )}
                  {/* Display trigger config summary */}
                  {rule.trigger_config && Object.keys(rule.trigger_config).length > 0 && (
                    <Typography sx={{ fontSize: 12, color: palette.status.default.text }}>
                      {rule.trigger_type === "risk_score_exceeded" && rule.trigger_config.risk_score_min != null && (
                        <>Threshold: risk score &ge; {String(rule.trigger_config.risk_score_min)}</>
                      )}
                      {rule.trigger_type === "usage_threshold_exceeded" && rule.trigger_config.event_count_threshold != null && (
                        <>Threshold: {String(rule.trigger_config.event_count_threshold)} events</>
                      )}
                      {rule.trigger_type === "sensitive_department" && Array.isArray(rule.trigger_config.departments) && (
                        <>Departments: {(rule.trigger_config.departments as string[]).join(", ")}</>
                      )}
                    </Typography>
                  )}
                  {/* Cooldown & notification */}
                  <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                    {rule.cooldown_minutes != null && (
                      <Typography sx={{ fontSize: 12, color: palette.text.disabled }}>
                        Cooldown: {rule.cooldown_minutes >= 1440
                          ? `${rule.cooldown_minutes / 1440}d`
                          : rule.cooldown_minutes >= 60
                            ? `${rule.cooldown_minutes / 60}h`
                            : `${rule.cooldown_minutes}m`}
                      </Typography>
                    )}
                    {rule.notification_user_ids && rule.notification_user_ids.length > 0 && (
                      <Typography sx={{ fontSize: 12, color: palette.text.disabled }}>
                        {rule.cooldown_minutes != null ? "· " : ""}Notifies via in-app + email
                      </Typography>
                    )}
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: palette.text.disabled }}>
                    Actions:{" "}
                    {Array.isArray(rule.actions)
                      ? rule.actions.map((a: { type: string }) => a.type.replace(/_/g, " ")).join(", ")
                      : rule.actions && typeof rule.actions === "object"
                        ? Object.keys(rule.actions).map((k) => k.replace(/_/g, " ")).join(", ")
                        : "None"}
                  </Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          message="No alerts have been triggered yet."
          showBorder
        />
      ) : (
        <TableContainer sx={singleTheme.tableStyles.primary.frame}>
          <Table>
            <SortableTableHead
              columns={ALERTS_COLUMNS}
              sortConfig={alertsSortConfig}
              onSort={handleAlertsSort}
            />
            <TableBody>
              {sortedAlerts.map((a) => (
                <TableRow key={a.id} sx={singleTheme.tableStyles.primary.body.row}>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {a.rule_name || `Rule #${a.rule_id}`}
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Chip
                      label={
                        TRIGGER_LABELS[a.trigger_type as ShadowAiTriggerType] ||
                        a.trigger_type ||
                        "—"
                      }
                      size="small"
                      variant="info"
                      uppercase={false}
                    />
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    {a.fired_at ? new Date(a.fired_at).toLocaleString() : "—"}
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
                    fontSize: 12,
                    opacity: 0.7,
                  }}
                >
                  Showing {alertsPage * ALERTS_PER_PAGE + 1} -{" "}
                  {Math.min((alertsPage + 1) * ALERTS_PER_PAGE, alertsTotal)} of{" "}
                  {alertsTotal} items
                </TableCell>
                <TablePagination
                  count={alertsTotal}
                  page={alertsPage}
                  onPageChange={(_e, newPage) => setAlertsPage(newPage)}
                  rowsPerPage={ALERTS_PER_PAGE}
                  rowsPerPageOptions={[ALERTS_PER_PAGE]}
                  ActionsComponent={(props) => (
                    <TablePaginationActions {...props} />
                  )}
                  labelRowsPerPage=""
                  labelDisplayedRows={({ page, count }) =>
                    `Page ${page + 1} of ${Math.max(0, Math.ceil(count / ALERTS_PER_PAGE))}`
                  }
                  slotProps={{
                    select: {
                      MenuProps: {
                        keepMounted: true,
                        PaperProps: {
                          className: "pagination-dropdown",
                          sx: { mt: 0, mb: theme.spacing(2) },
                        },
                        transformOrigin: { vertical: "bottom", horizontal: "left" },
                        anchorOrigin: { vertical: "top", horizontal: "left" },
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
                    "& .MuiSelect-icon": { width: "24px", height: "fit-content" },
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

      {/* Create rule modal */}
      <StandardModal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          resetForm();
        }}
        title="Create alert rule"
        description=""
        submitButtonText="Create"
        onSubmit={handleCreate}
        isSubmitting={creating}
        maxWidth="480px"
      >
        <Stack gap="16px">
          <Typography sx={{ fontSize: 13, color: palette.status.default.text, lineHeight: 1.5 }}>
            Create a rule to receive alerts when specific Shadow AI activity is detected. Choose a trigger type and the system will notify you when the condition is met.
          </Typography>
          <Field
            label="Rule name"
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="e.g., Alert on new AI tools"
            error={formErrors.name}
          />
          <Field
            label="Description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Optional description"
          />
          <Select
            id="trigger-type-select"
            label="Trigger type"
            value={formTrigger}
            onChange={(e: SelectChangeEvent<string | number>) => {
              setFormTrigger(e.target.value as ShadowAiTriggerType);
              setFormErrors({});
            }}
            items={Object.entries(TRIGGER_LABELS).map(([value, label]) => ({
              _id: value,
              name: label,
            }))}
          />

          {/* Trigger-specific config fields */}
          {formTrigger === "risk_score_exceeded" && (
            <Stack gap="6px">
              <Field
                label="Minimum risk score"
                type="number"
                value={formRiskScoreMin}
                onChange={(e) => {
                  setFormRiskScoreMin(e.target.value);
                  if (formErrors.riskScoreMin) setFormErrors((prev) => ({ ...prev, riskScoreMin: "" }));
                }}
                placeholder="e.g., 70"
                error={formErrors.riskScoreMin}
              />
              <Stack direction="row" alignItems="flex-start" gap="6px" sx={{ p: "8px 12px", bgcolor: palette.background.accent, borderRadius: "4px", border: `1px solid ${palette.border.light}` }}>
                <Info size={14} strokeWidth={1.5} color={palette.status.default.text} style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12, color: palette.status.default.text, lineHeight: 1.5 }}>
                  Risk score (0–100) is calculated nightly using a weighted formula: approval status (40%), data &amp; compliance policies (25%), usage volume (15%), and department sensitivity (20%). Unapproved tools with weak compliance posture in sensitive departments score highest.
                </Typography>
              </Stack>
            </Stack>
          )}
          {formTrigger === "usage_threshold_exceeded" && (
            <Stack gap="6px">
              <Field
                label="Event count threshold"
                type="number"
                value={formUsageThreshold}
                onChange={(e) => {
                  setFormUsageThreshold(e.target.value);
                  if (formErrors.usageThreshold) setFormErrors((prev) => ({ ...prev, usageThreshold: "" }));
                }}
                placeholder="e.g., 100"
                error={formErrors.usageThreshold}
              />
              <Stack direction="row" alignItems="flex-start" gap="6px" sx={{ p: "8px 12px", bgcolor: palette.background.accent, borderRadius: "4px", border: `1px solid ${palette.border.light}` }}>
                <Info size={14} strokeWidth={1.5} color={palette.status.default.text} style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12, color: palette.status.default.text, lineHeight: 1.5 }}>
                  This is the cumulative number of network events (API calls, page visits) recorded for a single AI tool across all users. For example, a threshold of 100 means the alert fires once a tool has been accessed 100 times total.
                </Typography>
              </Stack>
            </Stack>
          )}
          {formTrigger === "sensitive_department" && (
            <Field
              label="Departments (comma-separated)"
              value={formDepartments}
              onChange={(e) => {
                setFormDepartments(e.target.value);
                if (formErrors.departments) setFormErrors((prev) => ({ ...prev, departments: "" }));
              }}
              placeholder="e.g., Finance, Legal, HR"
              error={formErrors.departments}
            />
          )}

          {/* Cooldown period */}
          <Select
            id="cooldown-select"
            label="Cooldown period"
            value={formCooldown}
            onChange={(e: SelectChangeEvent<string | number>) =>
              setFormCooldown(String(e.target.value))
            }
            items={[
              { _id: "60", name: "1 hour" },
              { _id: "360", name: "6 hours" },
              { _id: "720", name: "12 hours" },
              { _id: "1440", name: "24 hours" },
            ]}
          />

          {/* Notification */}
          <FormControlLabel
            control={
              <MuiCheckbox
                size="small"
                checked={notifyMe}
                onChange={(e) => setNotifyMe(e.target.checked)}
                sx={{ py: 0.5 }}
              />
            }
            label={
              <Typography sx={{ fontSize: 13 }}>
                Notify me when this rule fires (in-app + email)
              </Typography>
            }
            sx={{ m: 0 }}
          />

          <Stack direction="row" alignItems="center" gap="8px">
            <Typography sx={{ fontSize: 13 }}>Active</Typography>
            <Toggle
              checked={formActive}
              onChange={(e) => setFormActive(e.target.checked)}
              size="small"
            />
          </Stack>
        </Stack>
      </StandardModal>

      {/* Delete confirmation modal */}
      <StandardModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description=""
        submitButtonText="Delete"
        onSubmit={handleDelete}
        submitButtonColor={palette.status.error.text}
        maxWidth="400px"
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          This action cannot be undone. All alert history for this rule will be
          preserved.
        </Typography>
      </StandardModal>
    </TabContext>
    </PageHeaderExtended>
  );
}
