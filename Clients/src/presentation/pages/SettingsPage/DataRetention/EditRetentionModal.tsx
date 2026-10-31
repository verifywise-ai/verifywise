import { useState } from "react";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import { Link } from "react-router";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import Toggle from "../../../components/Inputs/Toggle";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { useInvalidateDataRetention } from "../../../../application/hooks/useDataRetention";
import {
  previewAuditRetention,
  updateAuditRetention,
  updateGatewayRetention,
  type GatewayRetentionUpdate,
  type RetentionRow,
} from "../../../../application/repository/dataRetention.repository";
import { updateMrmSettings } from "../../../../application/repository/mrm.repository";
import { updateFileOrgSettings } from "../../../../application/repository/fileOrgSettings.repository";
import { updateSettingsConfig } from "../../../../application/repository/shadowAi.repository";
import {
  RETENTION_POLICY_OPTIONS,
  type RetentionPolicy,
} from "../../../../domain/enums/retention.enum";
import { fill } from "../../../../i18n/fill";
import { getGatewayErrorDetail } from "../../../../application/utils/apiErrorReason";
import {
  GatewayPurgeWarning,
  MAX_GATEWAY_RETENTION_DAYS,
  MIN_GATEWAY_RETENTION_DAYS,
  needsGatewayPurgeConfirmation,
} from "../../../components/GatewayPurgeConfirmation";
import { AUDIT_PERIOD_MONTHS, ROW_TITLES, monthsLabel, periodLabel } from "./retentionLabels";

/** Lowest value the MRM settings endpoint accepts. */
export const MIN_MRM_RETENTION_MONTHS = 13;
/** Highest Shadow AI retention the settings endpoint accepts. */
export const MAX_SHADOW_AI_RETENTION_DAYS = 3650;

const INDEFINITE = "";

// The house Field and Select stylesheets pin their height to 34px with
// selectors of specificity (0,2,1) and (0,3,0); repeating "&" raises these past both.
const FIELD_HEIGHT_SX = { "&&& .MuiInputBase-root": { height: "30px" } };
const SELECT_HEIGHT_SX = {
  "width": "100%",
  "&&& .MuiSelect-select": { height: "30px", minHeight: "30px", boxSizing: "border-box" },
};

const SHADOW_AI_FIELDS = {
  shadow_ai_events: "retention_events_days",
  shadow_ai_daily_rollups: "retention_daily_rollups_days",
  shadow_ai_alert_history: "retention_alert_history_days",
} as const;

interface EditRetentionModalProps {
  row: RetentionRow;
  /** Every row on the page; the gateway confirmation names the other log type's period. */
  rows: RetentionRow[];
  onClose: () => void;
}

const isWholeNumber = (text: string) => /^\d+$/.test(text.trim());

/** Months with indefinite (null) counted as the longest period. */
const rank = (months: number | null) => (months === null ? Infinity : months);

const initialValue = (row: RetentionRow): string => {
  const { period } = row;
  // Turning the default off must not silently pin the default's value.
  if (row.key === "agent_control_logs" && row.usesDeploymentDefault === true) return "";
  if (period === null) return row.key === "audit_records" ? INDEFINITE : "";
  if (period.unit === "policy") return period.value ?? "";
  return String(period.value);
};

export default function EditRetentionModal({ row, rows, onClose }: EditRetentionModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const invalidate = useInvalidateDataRetention();

  const [value, setValue] = useState(initialValue(row));
  const [autoDelete, setAutoDelete] = useState(row.automaticDeletion === "yes");
  const [useDefault, setUseDefault] = useState(row.usesDeploymentDefault === true);
  // Set once an Agent Control change that shortens the period is waiting for the go-ahead.
  const [pendingAgent, setPendingAgent] = useState<{
    update: GatewayRetentionUpdate;
    days: number;
  } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set once a shortening has been previewed and is waiting for the user's go-ahead.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  // Set once a gateway change that deletes logs daily is waiting for the user's go-ahead.
  const [pendingGateway, setPendingGateway] = useState<{
    update: GatewayRetentionUpdate;
    guardrailDays: number;
    spendDays: number;
  } | null>(null);

  const currentAuditMonths = row.period?.unit === "months" ? row.period.value : null;
  const title = t(ROW_TITLES[row.key].title);
  const isAgentControl = row.key === "agent_control_logs";
  const isGateway = row.key === "ai_gateway_guardrail_logs" || row.key === "ai_gateway_spend_logs";

  /** Current days of a gateway log type, from the page's rows; null if not shown. */
  const gatewayDays = (key: RetentionRow["key"]): number | null => {
    const found = rows.find((r) => r.key === key);
    return found?.period?.unit === "days" ? found.period.value : null;
  };

  const auditItems = [
    { _id: INDEFINITE, name: t("Keep indefinitely") },
    ...AUDIT_PERIOD_MONTHS.map((months) => ({
      _id: String(months),
      name: monthsLabel(t, months),
    })),
  ];

  const finish = async () => {
    await invalidate();
    onClose();
  };

  const validateNumber = (min: number, max?: number): number | null => {
    const text = value.trim();
    if (!isWholeNumber(text)) {
      setError(t("Enter a whole number"));
      return null;
    }
    const parsed = Number(text);
    if (parsed < min) {
      setError(fill(t("Enter a number of at least {min}"), { min }));
      return null;
    }
    if (max !== undefined && parsed > max) {
      setError(fill(t("Enter a number no greater than {max}"), { max }));
      return null;
    }
    return parsed;
  };

  const saveAudit = async (months: number | null) => {
    await updateAuditRetention(months);
    await finish();
  };

  /** Save a gateway change; a validation error from the gateway is shown on the form. */
  const saveGateway = async (update: GatewayRetentionUpdate) => {
    try {
      await updateGatewayRetention(update);
    } catch (err) {
      const detail = getGatewayErrorDetail(err);
      if (detail === null) throw err;
      setPendingGateway(null);
      setPendingAgent(null);
      setError(detail);
      return;
    }
    await finish();
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setError(undefined);
    setIsSubmitting(true);
    try {
      if (row.key === "audit_records") {
        const months = value === INDEFINITE ? null : Number(value);
        if (pendingDelete !== null || rank(months) >= rank(currentAuditMonths)) {
          await saveAudit(months);
          return;
        }
        const { count } = await previewAuditRetention(months as number);
        // Even with nothing to delete yet, later cleanups delete what the old
        // period would have kept, so every shortening is confirmed.
        setPendingDelete(count);
        return;
      }

      if (isGateway) {
        if (pendingGateway !== null) {
          await saveGateway(pendingGateway.update);
          return;
        }
        const days = validateNumber(MIN_GATEWAY_RETENTION_DAYS, MAX_GATEWAY_RETENTION_DAYS);
        if (days === null) return;
        const currentGuardrail = gatewayDays("ai_gateway_guardrail_logs");
        const currentSpend = gatewayDays("ai_gateway_spend_logs");
        if (currentGuardrail === null || currentSpend === null) {
          setError(t("Retention settings could not be loaded."));
          return;
        }
        const isGuardrail = row.key === "ai_gateway_guardrail_logs";
        const update: GatewayRetentionUpdate = {};
        const daysKey = isGuardrail ? "log_retention_days" : "spend_log_retention_days";
        if ((isGuardrail ? currentGuardrail : currentSpend) !== days) update[daysKey] = days;
        const wasAutoDelete = row.automaticDeletion === "yes";
        if (autoDelete !== wasAutoDelete) update.auto_purge_enabled = autoDelete;
        // Turning on daily deletion, or shortening a period while it is on,
        // deletes logs permanently, so it is confirmed first.
        const next = {
          guardrailDays: isGuardrail ? days : currentGuardrail,
          spendDays: isGuardrail ? currentSpend : days,
          autoPurge: autoDelete,
        };
        const current = {
          guardrailDays: currentGuardrail,
          spendDays: currentSpend,
          autoPurge: wasAutoDelete,
        };
        if (needsGatewayPurgeConfirmation(current, next)) {
          setPendingGateway({
            update,
            guardrailDays: next.guardrailDays,
            spendDays: next.spendDays,
          });
          return;
        }
        if (Object.keys(update).length > 0) {
          await saveGateway(update);
        } else {
          await finish();
        }
        return;
      }

      if (isAgentControl) {
        if (pendingAgent !== null) {
          await saveGateway(pendingAgent.update);
          return;
        }
        const minDays = row.minDays ?? MIN_GATEWAY_RETENTION_DAYS;
        const days = useDefault ? null : validateNumber(minDays, MAX_GATEWAY_RETENTION_DAYS);
        if (!useDefault && days === null) return;
        const defaultDays = row.deploymentDefaultDays ?? 0;
        /** Days kept, with "kept indefinitely" (0 or less) as the longest. */
        const kept = (d: number) => (d > 0 ? d : Infinity);
        const currentKept = row.period?.unit === "days" ? row.period.value : Infinity;
        const nextKept = useDefault ? kept(defaultDays) : (days as number);
        const unchanged =
          useDefault === (row.usesDeploymentDefault === true) &&
          (useDefault || days === currentKept);
        if (unchanged) {
          await finish();
          return;
        }
        const update: GatewayRetentionUpdate = {
          mcp_audit_retention_days: useDefault ? null : days,
        };
        if (nextKept < currentKept) {
          setPendingAgent({ update, days: nextKept });
          return;
        }
        await saveGateway(update);
        return;
      }

      if (row.key === "mrm_metrics") {
        const months = validateNumber(MIN_MRM_RETENTION_MONTHS);
        if (months === null) return;
        await updateMrmSettings({ retention_months: months });
        await finish();
        return;
      }

      if (row.key === "evidence_files") {
        await updateFileOrgSettings({
          default_retention_policy: (value || null) as RetentionPolicy | null,
        });
        await finish();
        return;
      }

      if (row.key in SHADOW_AI_FIELDS) {
        const blank = value.trim() === "";
        const days = blank ? 0 : validateNumber(0, MAX_SHADOW_AI_RETENTION_DAYS);
        if (days === null) return;
        await updateSettingsConfig({
          [SHADOW_AI_FIELDS[row.key as keyof typeof SHADOW_AI_FIELDS]]: days,
        });
        await finish();
      }
    } catch {
      // The request interceptor already shows the error; keep the modal open.
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirming = pendingDelete !== null || pendingGateway !== null || pendingAgent !== null;
  const selectedMonths = value === INDEFINITE ? null : Number(value);

  return (
    <StandardModal
      isOpen
      onClose={onClose}
      title={fill(t("Edit retention: {name}"), { name: title })}
      description={t(ROW_TITLES[row.key].description ?? "Choose how long these records are kept")}
      onSubmit={handleSubmit}
      submitButtonText={confirming ? t("Delete records") : t("Save")}
      submitButtonColor={confirming ? theme.palette.error.main : undefined}
      isSubmitting={isSubmitting}
      maxWidth="560px"
      fitContent
    >
      {pendingAgent !== null ? (
        <Typography sx={{ fontSize: 13 }}>
          {fill(
            t(
              "Tool-call logs and decided approvals older than {period} will be deleted permanently at the next daily cleanup. Deleted records cannot be restored.",
            ),
            { period: periodLabel(t, { unit: "days", value: pendingAgent.days }) },
          )}
        </Typography>
      ) : pendingGateway !== null ? (
        <GatewayPurgeWarning
          guardrailDays={pendingGateway.guardrailDays}
          spendDays={pendingGateway.spendDays}
        />
      ) : confirming ? (
        <Stack sx={{ gap: "16px" }}>
          <Typography sx={{ fontSize: 13 }}>
            {fill(
              t(
                pendingDelete === 0
                  ? "No records are old enough to delete yet. From now on, records older than {period} will be deleted permanently. Deleted records cannot be restored."
                  : "The next cleanup will permanently delete {count} records older than {period}. Deleted records cannot be restored.",
              ),
              {
                count: (pendingDelete ?? 0).toLocaleString(),
                period: selectedMonths === null ? "" : monthsLabel(t, selectedMonths),
              },
            )}
          </Typography>
          <Typography sx={{ fontSize: 13 }}>
            <Link to="/settings/audit-ledger" onClick={onClose}>
              {t("Export CSV first")}
            </Link>
          </Typography>
        </Stack>
      ) : (
        <Stack sx={{ gap: "16px" }}>
          {row.key === "audit_records" && (
            <Select
              id="retention-audit-period"
              label={t("Keep audit records for")}
              items={auditItems}
              value={value}
              onChange={(event) => setValue(String(event.target.value))}
              sx={SELECT_HEIGHT_SX}
            />
          )}
          {isGateway && (
            <>
              <Field
                id="retention-days"
                label={t("Keep for (days)")}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                error={error}
                sx={FIELD_HEIGHT_SX}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Toggle
                  checked={autoDelete}
                  onChange={(event) => setAutoDelete(event.target.checked)}
                  ariaLabel={t("Delete automatically")}
                />
                <Typography sx={{ fontSize: 13 }}>{t("Delete automatically")}</Typography>
              </Box>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {t("This setting applies to both AI Gateway log types.")}
              </Typography>
            </>
          )}
          {isAgentControl && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Toggle
                  checked={useDefault}
                  onChange={(event) => setUseDefault(event.target.checked)}
                  ariaLabel={t("Use the deployment default")}
                />
                <Typography sx={{ fontSize: 13 }}>
                  {fill(t("Use the deployment default ({period})"), {
                    period: periodLabel(
                      t,
                      (row.deploymentDefaultDays ?? 0) > 0
                        ? { unit: "days", value: row.deploymentDefaultDays as number }
                        : null,
                    ),
                  })}
                </Typography>
              </Box>
              {/* The days field shows errors itself; while it is hidden, show the gateway's here. */}
              {useDefault && error && (
                <Typography role="alert" sx={{ fontSize: 12, color: theme.palette.error.main }}>
                  {error}
                </Typography>
              )}
              {!useDefault && (
                <Field
                  id="retention-days"
                  label={t("Keep for (days)")}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  error={error}
                  sx={FIELD_HEIGHT_SX}
                  helperText={fill(t("From {min} to {max} days."), {
                    min: row.minDays ?? MIN_GATEWAY_RETENTION_DAYS,
                    max: MAX_GATEWAY_RETENTION_DAYS,
                  })}
                />
              )}
            </>
          )}
          {row.key === "mrm_metrics" && (
            <Field
              id="retention-months"
              label={t("Keep for (months)")}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              error={error}
              sx={FIELD_HEIGHT_SX}
              helperText={fill(t("At least {min} months."), { min: MIN_MRM_RETENTION_MONTHS })}
            />
          )}
          {row.key === "evidence_files" && (
            <Select
              id="retention-evidence-policy"
              label={t("Default retention policy")}
              items={RETENTION_POLICY_OPTIONS}
              value={value}
              onChange={(event) => setValue(String(event.target.value))}
              placeholder={t("No default")}
              sx={SELECT_HEIGHT_SX}
            />
          )}
          {row.key in SHADOW_AI_FIELDS && (
            <Field
              id="retention-days"
              label={t("Keep for (days)")}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              error={error}
              sx={FIELD_HEIGHT_SX}
              helperText={fill(t("Leave empty or enter 0 to keep indefinitely. Maximum {max}."), {
                max: MAX_SHADOW_AI_RETENTION_DAYS,
              })}
            />
          )}
        </Stack>
      )}
    </StandardModal>
  );
}
