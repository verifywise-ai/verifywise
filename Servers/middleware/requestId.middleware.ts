import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { asyncLocalStorage } from "../utils/context/context";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  asyncLocalStorage.run({ requestId }, () => next());
}
