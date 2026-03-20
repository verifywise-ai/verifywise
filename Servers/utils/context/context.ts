import { AsyncLocalStorage } from 'async_hooks';

type RequestContext = {
  userId?: number;
  tenantId?: number;
  organizationId?: number;
  tenantHash?: string;
};

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();
