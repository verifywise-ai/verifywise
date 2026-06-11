import React from "react";
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
 *   const gate = useRequiredCustomFieldsGate("vendor", vendorId);
 *   <Button disabled={gate.blocked} onClick={save}>Save</Button>
 *   {gate.reason && <Tooltip title={gate.reason} />}
 */
export function useRequiredCustomFieldsGate(
  entityType: CustomFieldEntityType,
  entityId: number | null,
): { blocked: boolean; reason: string | null; missingLabels: string[] } {
  const { data: missing = [], isLoading } = useMissingRequiredCustomFields(entityType, entityId);
  if (isLoading || missing.length === 0) {
    return { blocked: false, reason: null, missingLabels: [] };
  }
  const labels = missing.map((m) => m.label);
  return {
    blocked: true,
    reason: `Missing required custom fields: ${labels.join(", ")}`,
    missingLabels: labels,
  };
}
