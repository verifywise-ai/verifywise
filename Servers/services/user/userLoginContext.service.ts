/**
 * Helpers for assembling the post-login response payload: the organization's
 * onboarding status and whether the logging-in user is the org creator (first
 * admin to be created).
 */

import { sequelize } from "../../database/db";

export interface LoginOrgContext {
  onboardingStatus: string;
  isOrgCreator: boolean;
}

/**
 * Resolve onboarding state + creator flag for a freshly authenticated user.
 * Returns sensible defaults if the lookups fail.
 */
export async function buildLoginOrgContext(
  orgId: number | null | undefined,
  userId: number,
): Promise<LoginOrgContext> {
  let onboardingStatus = "completed";
  let isOrgCreator = false;

  if (!orgId) return { onboardingStatus, isOrgCreator };

  const [orgResult] = await sequelize.query(
    `SELECT onboarding_status FROM organizations WHERE id = :orgId`,
    { replacements: { orgId }, type: "SELECT" as any },
  );
  if (orgResult && (orgResult as any).onboarding_status) {
    onboardingStatus = (orgResult as any).onboarding_status;
  }

  const [creatorResult] = await sequelize.query(
    `SELECT id FROM users
     WHERE organization_id = :orgId AND role_id = 1
     ORDER BY created_at ASC LIMIT 1`,
    { replacements: { orgId }, type: "SELECT" as any },
  );
  if (creatorResult && (creatorResult as any).id === userId) {
    isOrgCreator = true;
  }

  return { onboardingStatus, isOrgCreator };
}
