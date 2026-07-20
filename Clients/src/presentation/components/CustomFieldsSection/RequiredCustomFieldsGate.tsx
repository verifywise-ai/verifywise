import React, { useCallback, useMemo, useState } from "react";
import { Alert, AlertTitle, Box } from "@mui/material";
import type { CustomFieldEntityType } from "../../../domain/interfaces/i.customField";
import { useMissingRequiredCustomFields } from "../../../application/hooks/useCustomFields";

/**
 * Shows a warning banner when an entity is missing required custom fields.
 * Pair with `useRequiredCustomFieldsGate` to actually block the parent's
 * save button.
 */
export const RequiredCustomFieldsBanner: React.FC<{
  entityType: CustomFieldEntityType;
  entityId: number | null;
}> = ({ entityType, entityId }) => {
  const { data: missing = [], isLoading } = useMissingRequiredCustomFields(entityType, entityId);
  if (isLoading || missing.length === 0) return null;

  return (
    <Box sx={{ my: 1 }}>
      <Alert severity="warning">
        <AlertTitle>Required custom fields missing</AlertTitle>
        Save is blocked until you set values for:{" "}
        <strong>{missing.map((m) => m.label).join(", ")}</strong>. Use the Custom fields tab to set
        them.
      </Alert>
    </Box>
  );
};

/**
 * Returns whether the parent entity's save should be blocked due to
 * missing required custom field values.
 *
 * The gate also exposes an `onPendingChange` callback meant to be wired to
 * `<CustomFieldsSection onPendingChange={gate.onPendingChange} />`. Pending
 * (staged but not yet persisted) values cover the server-reported missing
 * entries, which is what unblocks the parent Save once the user has typed a
 * value — otherwise the flow would deadlock: save is gated by missing → flush
 * never runs → server still sees the value as missing → save stays gated.
 *
 *   const gate = useRequiredCustomFieldsGate("vendor", vendorId);
 *   <CustomFieldsSection onPendingChange={gate.onPendingChange} ... />
 *   <Button disabled={gate.blocked} onClick={save}>Save</Button>
 */
export function useRequiredCustomFieldsGate(
  entityType: CustomFieldEntityType,
  entityId: number | null,
): {
  blocked: boolean;
  reason: string | null;
  missingLabels: string[];
  onPendingChange: (pendingDefinitionIds: ReadonlySet<number>) => void;
} {
  const { data: missing = [], isLoading } = useMissingRequiredCustomFields(entityType, entityId);
  const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set());

  // setPending is reactively wired into CustomFieldsSection via the returned
  // onPendingChange — keep its reference stable so the callback prop doesn't
  // thrash and re-trigger the child's effect every render.
  const onPendingChange = useCallback((ids: ReadonlySet<number>) => {
    setPending(ids);
  }, []);

  return useMemo(() => {
    if (isLoading) {
      return { blocked: false, reason: null, missingLabels: [], onPendingChange };
    }
    const stillMissing = missing.filter((m) => !pending.has(m.id));
    if (stillMissing.length === 0) {
      return { blocked: false, reason: null, missingLabels: [], onPendingChange };
    }
    const labels = stillMissing.map((m) => m.label);
    return {
      blocked: true,
      reason: `Missing required custom fields: ${labels.join(", ")}`,
      missingLabels: labels,
      onPendingChange,
    };
  }, [isLoading, missing, pending, onPendingChange]);
}
