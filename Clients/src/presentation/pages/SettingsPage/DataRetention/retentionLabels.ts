import { fill } from "../../../../i18n/fill";
import {
  RETENTION_POLICY_LABELS,
  type RetentionPolicy,
} from "../../../../domain/enums/retention.enum";
import type {
  RetentionPeriod,
  RetentionRecordKey,
  RetentionRow,
} from "../../../../application/repository/dataRetention.repository";

type Translate = (text: string) => string;

/** Audit record periods the server accepts, in months. */
export const AUDIT_PERIOD_MONTHS = [12, 24, 36, 60, 84, 120] as const;

export const ROW_TITLES: Record<RetentionRecordKey, { title: string; description?: string }> = {
  audit_records: {
    title: "Audit records",
    description: "Audit ledger, event log, change history, AI Advisor actions, file access logs",
  },
  ai_gateway_guardrail_logs: { title: "AI Gateway guardrail logs" },
  ai_gateway_spend_logs: { title: "AI Gateway spend logs" },
  agent_control_logs: {
    title: "Agent Control logs",
    description: "Tool-call logs and decided approvals",
  },
  mrm_metrics: { title: "Model risk metrics" },
  evidence_files: {
    title: "Evidence files",
    description: "Default for new files; each file can set its own",
  },
  shadow_ai_events: { title: "Shadow AI events" },
  shadow_ai_daily_rollups: { title: "Shadow AI daily rollups" },
  shadow_ai_alert_history: { title: "Shadow AI alert history" },
  server_logs: { title: "Server logs", description: "Self-hosted application logs" },
};

export function monthsLabel(t: Translate, months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return fill(t(years === 1 ? "{count} year" : "{count} years"), { count: years });
  }
  return fill(t(months === 1 ? "{count} month" : "{count} months"), { count: months });
}

export function daysLabel(t: Translate, days: number): string {
  return fill(t(days === 1 ? "{count} day" : "{count} days"), { count: days });
}

export function periodLabel(t: Translate, period: RetentionPeriod): string {
  if (period === null) return t("Indefinitely");
  if (period.unit === "months") return monthsLabel(t, period.value);
  if (period.unit === "days") return daysLabel(t, period.value);
  if (period.value === null) return t("No default");
  return t(RETENTION_POLICY_LABELS[period.value as RetentionPolicy] ?? period.value);
}

export function automaticDeletionLabel(t: Translate, value: RetentionRow["automaticDeletion"]) {
  switch (value) {
    case "yes":
      return t("Yes");
    case "no":
      return t("No");
    case "archive":
      return t("Archived, not deleted");
    case "rotate":
      return t("Rotated daily");
  }
}

export function lastCleanupLabel(
  t: Translate,
  row: RetentionRow,
  formatDate: (date: Date) => string,
): string {
  // Agent Control cleans up daily, but only when it has a period to apply.
  if (row.key === "agent_control_logs") {
    return !row.unavailable && row.automaticDeletion === "yes" ? t("Daily") : "—";
  }
  if (row.key === "server_logs") return t("Rotated daily");
  const run = row.lastCleanup;
  if (!run) return "—";
  if (run.status === "failed") {
    if (run.refusal === "internal_key_not_configured") {
      return t("Purge refused: internal key not configured");
    }
    if (run.refusal === "internal_key_rejected") return t("Purge refused: internal key rejected");
    return t("Failed");
  }
  const values = { date: formatDate(new Date(run.ranAt)), count: run.deletedCount };
  return fill(
    t(
      run.status === "capped"
        ? "{date} · {count} removed (more pending)"
        : "{date} · {count} removed",
    ),
    values,
  );
}
