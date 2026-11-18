/**
 * The user an advisor tool acts for: the user who asked for the action
 * (`_requesterId`, set by the approval gateway from the approval record),
 * else the user the gateway runs it for (`_userId`: the chatting user for a
 * read or an auto-approved write, the approver otherwise). Undefined when
 * neither is a valid user id (missing, not a number, zero or negative), so
 * callers fail closed or record NULL rather than a made-up user.
 */
export const actingRequesterId = (params: Record<string, unknown>): number | undefined => {
  const userId = Number(params._requesterId) || Number(params._userId);
  if (!userId || userId < 0) return undefined;
  return userId;
};
