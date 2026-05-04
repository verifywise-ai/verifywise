import { asyncLocalStorage } from "../utils/context/context";
import { Request, Response, NextFunction } from "express";

interface AuthenticatedRequest extends Request {
  userId?: number;
  tenantId?: string;
  organizationId?: number;
}

export default function contextMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const { userId, tenantId, organizationId } = req;

  asyncLocalStorage.run(
    {
      userId: typeof userId === "number" ? userId : undefined,
      tenantId,
      organizationId,
    },
    () => {
      next();
    },
  );
}
