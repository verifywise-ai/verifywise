/**
 * The organization check of the research agent, for a user that someone else named: the assignee of
 * a vendor, who is told when a run stores findings (job.ts), and the action owner of a finding that
 * is accepted (findings.service.ts). Nothing in the database ties either of them to the
 * organization of the vendor, so both are checked before anything is written for them.
 *
 * This is a module of its own, and not part of utils/user.utils.ts, so that a unit test which
 * replaces that module to fake the lookup (`jest.mock("../../../utils/user.utils")`) replaces the
 * lookup only, and not this check with it.
 */
import type { Transaction } from "sequelize";
import { findUsersNotInOrganization } from "../../utils/user.utils";

/**
 * Whether the user belongs to the organization. The lookup ignores an id that is not a positive
 * whole number and so reports nothing missing for it: an empty answer is only a yes for an id that
 * was valid to begin with. `Number.isSafeInteger` also refuses a number past 2^53 - 1, which
 * cannot be the id of a user.
 *
 * Such an id is answered without a lookup. A lookup that fails rejects, so a caller can tell a
 * failure from a no. The transaction is passed on only when there is one, because the lookup takes
 * it as an optional last argument.
 */
export async function isUserOfOrganization(
  userId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;

  const missing = transaction
    ? await findUsersNotInOrganization([userId], organizationId, transaction)
    : await findUsersNotInOrganization([userId], organizationId);
  return missing.length === 0;
}
