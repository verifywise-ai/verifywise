/**
 * Who an advisor model or model risk write runs as, and how a refused write
 * is reported. The tools write through the model services
 * (services/modelInventory.service.ts, services/modelRisk.service.ts), so the
 * approval rule, change history, the deployment step and notices are the
 * console's.
 */
import { getUserRoleInOrganization, userHasPermission } from "../../utils/userPermission.utils";
import { roleIsOrganizationAdmin } from "../../utils/organizationAdmin.utils";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";
import type { ModelWriteContext } from "../../services/modelInventory.service";
import { actingUserId, type Refusal } from "./useCaseScope";

export const MODEL_WRITE_REFUSED = "Your role does not allow changing models";

/**
 * The acting user's write context (the requester after an approval, else the
 * chatting user): model.edit, as the console's model routes ask, and Admin
 * from their role in the organization. A refusal when the user is unknown,
 * not a member or lacks model.edit: it fails closed.
 */
export async function modelWriteContext(
  params: Record<string, unknown>,
  organizationId: number,
): Promise<ModelWriteContext | Refusal> {
  return modelWriteContextForUser(organizationId, actingUserId(params));
}

/**
 * The same for a known user id: the requester of an approved AI action
 * (`aiActions/registerModel`, `aiActions/createModelRisk`).
 */
export async function modelWriteContextForUser(
  organizationId: number,
  userId: number | undefined,
): Promise<ModelWriteContext | Refusal> {
  const role = userId ? await getUserRoleInOrganization(organizationId, userId) : undefined;
  if (!userId || !role || !(await userHasPermission(organizationId, userId, "model.edit"))) {
    return { success: false, message: MODEL_WRITE_REFUSED };
  }
  return {
    organizationId,
    userId,
    callerIsAdmin: await roleIsOrganizationAdmin(organizationId, role.name),
    useCaseViewer: { userId, role: role.name },
  };
}

export const isRefusal = (value: unknown): value is Refusal =>
  typeof value === "object" && value !== null && (value as Refusal).success === false;

/**
 * A refused write (approval rule, a bad or foreign reference, a missing row,
 * an MRM-protected model) as the tool's failure message; anything else is
 * thrown on, as before.
 */
export function refusalFrom(error: unknown): Refusal {
  if (
    error instanceof ForbiddenException ||
    error instanceof ValidationException ||
    error instanceof NotFoundException ||
    error instanceof ConflictException
  ) {
    return { success: false, message: error.message };
  }
  throw error;
}
