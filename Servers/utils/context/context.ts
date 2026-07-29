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
};

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();
