import { Typography } from "@mui/material";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";

/** Retention periods the AI Gateway accepts for guardrail and spend logs, in days. */
export const MIN_GATEWAY_RETENTION_DAYS = 1;
export const MAX_GATEWAY_RETENTION_DAYS = 3650;

/** The gateway's period for an organization that has not saved its own settings. */
export const GATEWAY_DEFAULT_RETENTION_DAYS = 90;

export interface GatewayRetentionState {
  guardrailDays: number;
  spendDays: number;
  autoPurge: boolean;
}

/**
 * Whether saving `next` over `current` deletes logs permanently and so needs
 * the user's go-ahead: turning automatic deletion on, or shortening either
 * period while it stays on. Automatic deletion covers both log types, so a
 * change to either period counts.
 */
export function needsGatewayPurgeConfirmation(
  current: GatewayRetentionState,
  next: GatewayRetentionState,
): boolean {
  if (!next.autoPurge) return false;
  if (!current.autoPurge) return true;
  return next.guardrailDays < current.guardrailDays || next.spendDays < current.spendDays;
}

/** The confirmation text, naming both periods that will apply. */
export function GatewayPurgeWarning({
  guardrailDays,
  spendDays,
}: {
  guardrailDays: number;
  spendDays: number;
}) {
  const { t } = useTranslation();
  return (
    <Typography sx={{ fontSize: 13 }}>
      {fill(
        t(
          "Guardrail logs older than {guardrailDays} days and spend logs older than {spendDays} days will be deleted permanently every day. Deleted logs cannot be restored.",
        ),
        { guardrailDays, spendDays },
      )}
    </Typography>
  );
}
