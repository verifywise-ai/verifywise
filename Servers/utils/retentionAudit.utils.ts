import { appendToAuditLedger } from "./auditLedger.utils";
import { logFailure } from "./logger/logHelper";
import { roleHasPermission } from "./rolePermissions.utils";

/**
 * Whether a role may change organization-wide retention periods: the same
 * `organization.admin` permission the Data retention routes authorize on, so
 * a custom role granted it qualifies. SuperAdmin keeps the access these
 * handlers always gave it.
 */
export async function canChangeRetentionPeriods(
  organizationId: number | null | undefined,
  role: string | undefined,
): Promise<boolean> {
  if (!role) return false;
  if (role === "SuperAdmin") return true;
  return roleHasPermission(organizationId ?? null, role, "organization.admin");
}

/**
 * Leave a durable trace of a retention period change in the audit ledger.
 * The setting is already saved, so a failed append is logged and never fails
 * the request.
 */
export async function appendRetentionChangeToLedger(params: {
  organizationId: number;
  userId: number | null | undefined;
  description: string;
  functionName: string;
  fileName: string;
}): Promise<void> {
  const { organizationId, userId, description, functionName, fileName } = params;
  try {
    await appendToAuditLedger({
      organizationId,
      entryType: "event_log",
      userId: userId ?? null,
      eventType: "Update",
      entityType: "data_retention",
      description,
    });
  } catch (ledgerError) {
    await logFailure({
      eventType: "Update",
      description: `${description} but the audit ledger entry could not be written (organization ${organizationId}): ${(ledgerError as Error)?.message ?? ledgerError}`,
      functionName,
      fileName,
      userId: userId!,
      organizationId,
      error: ledgerError as Error,
    });
  }
}
