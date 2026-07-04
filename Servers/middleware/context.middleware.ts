import { asyncLocalStorage } from "../utils/context/context";
import { Request, Response, NextFunction } from "express";

interface AuthenticatedRequest extends Request {
  userId?: number;
  organizationId?: number;
}

export default function contextMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const { userId, organizationId } = req;

  asyncLocalStorage.run(
    {
      userId: typeof userId === "number" ? userId : undefined,
      organizationId,
    },
    () => {
      next();
    },
  );
}
