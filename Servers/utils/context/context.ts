import { AsyncLocalStorage } from "async_hooks";
import type { Transaction } from "sequelize";

type RequestContext = {
  userId?: number;
  organizationId?: number;
  tenantHash?: string;
  /**
   * RLS Phase 2 (flag-gated): per-request transaction carrying
   * `SET LOCAL app.current_org`. Set by rlsEnforcement when
   * RLS_ENFORCEMENT_ENABLED=true; enableRlsQueryScoping routes the
   * request's sequelize queries through it. Undefined otherwise.
   */
  transaction?: Transaction;
  /**
   * The caller's local date as their browser sent it (CLIENT_DATE_HEADER),
   * unchecked. Read it with getRequestClientDate and check it before use
   * (incidentToday accepts it only when it is today somewhere on earth).
   */
  clientDate?: string;
};

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Request header carrying the browser's local date ("YYYY-MM-DD"), so a day
 * the server records for the user (an incident approval date) is their own
 * calendar day rather than the UTC one.
 */
export const CLIENT_DATE_HEADER = "x-client-date";

/** The CLIENT_DATE_HEADER value of a request, or undefined when absent. */
export const readClientDateHeader = (headers: Record<string, unknown>): string | undefined => {
  const value = headers[CLIENT_DATE_HEADER];
  const first = Array.isArray(value) ? value[0] : value;
  // A date is 10 characters; anything much longer is not one.
  return typeof first === "string" && first.length <= 32 ? first.trim() : undefined;
};

/** The current request's client date (unchecked), or undefined outside one. */
export const getRequestClientDate = (): string | undefined =>
  asyncLocalStorage.getStore()?.clientDate;
