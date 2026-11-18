/**
 * The model approval rule as the model form applies it. It mirrors the
 * server (`Servers/utils/modelApproval.utils.ts`); the server stays the
 * judge. "Decides" means an Admin or the model's SAVED approver.
 *
 * - Decisions are Approved, Restricted, Blocked and Rejected.
 * - With a saved approver, only someone who decides moves the status to or
 *   from a decision, and only they change or clear the approver.
 * - In a save that names a new approver only an Admin also decides.
 * - A non-Admin cannot pick themself as a new approver.
 */

export const MODEL_DECISION_STATUSES = ["Approved", "Restricted", "Blocked", "Rejected"];

export const isModelDecision = (status: string | null | undefined): boolean =>
  MODEL_DECISION_STATUSES.includes(status ?? "");

/** null for none ("", 0, null, undefined). */
const toApprover = (value: unknown): number | null => {
  const id = Number(value);
  return value === "" || value === null || value === undefined || !id ? null : id;
};

export interface ModelApprovalState {
  savedApprover: unknown;
  savedStatus: string | null;
  /** The approver picked in the form now. */
  approver: unknown;
  userId: number | null;
  isAdmin: boolean;
}

export function modelApprovalLocks(state: ModelApprovalState) {
  const savedApprover = toApprover(state.savedApprover);
  const nextApprover = toApprover(state.approver);
  const approverChanged = nextApprover !== savedApprover;
  const callerDecides = state.isAdmin || (savedApprover !== null && savedApprover === state.userId);

  const approverLocked = !callerDecides && savedApprover !== null;

  const canPickStatus = (status: string): boolean => {
    const touchesDecision =
      status !== state.savedStatus &&
      (isModelDecision(status) || isModelDecision(state.savedStatus));
    if (!touchesDecision) return true;
    if (savedApprover !== null && !callerDecides) return false;
    if (approverChanged && nextApprover !== null && !state.isAdmin) return false;
    return true;
  };

  const canPickApprover = (id: number): boolean =>
    state.isAdmin || id !== state.userId || id === savedApprover;

  return { approverLocked, canPickStatus, canPickApprover };
}
