import { decideShow } from "./rules";
import {
  getNoticeContextQuery,
  recordViewQuery,
  setDismissedQuery,
} from "../../utils/changeNotice.utils";

/**
 * Applies the show rules for one visit. Records the visit only when the notice
 * is shown; a refusal writes nothing.
 */
export async function viewNotice(input: {
  userId: number;
  organizationId: number;
  id: string;
  now: Date;
}): Promise<{ show: boolean }> {
  const context = await getNoticeContextQuery(input.userId, input.organizationId, input.id);
  if (!context) return { show: false };
  if (!decideShow({ ...context, now: input.now })) return { show: false };
  await recordViewQuery(input.userId, input.id, input.now.toISOString());
  return { show: true };
}

/** Dismisses a notice, or restores it (Undo) when `dismissed` is false. */
export async function setDismissed(input: {
  userId: number;
  id: string;
  dismissed: boolean;
  now: Date;
}): Promise<{ dismissed: boolean }> {
  await setDismissedQuery(input.userId, input.id, input.dismissed, input.now.toISOString());
  return { dismissed: input.dismissed };
}
