/**
 * Shared express-validator error handler.
 *
 * Runs validationResult(req) and, if any chain produced an error, short-circuits
 * with a STATUS_CODE[400] response in the standard envelope:
 *   { message: "Bad Request", data: { errors: [{ field, message, location, value? }, ...] } }
 *
 * Use via the `validate(...chains)` convenience wrapper:
 *   router.post("/", authenticateJWT, validate(body("name").isString().notEmpty()), createX);
 */
import { NextFunction, Request, Response } from "express";
import { ValidationChain, validationResult } from "express-validator";
import { STATUS_CODE } from "../utils/statusCode.utils";

export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction,
): void | Response {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array({ onlyFirstError: true }).map((err) => {
    const field = "path" in err && typeof err.path === "string" ? err.path : "unknown";
    const location = "location" in err && typeof err.location === "string" ? err.location : "body";
    return {
      field,
      message: err.msg,
      location,
    };
  });

  return res.status(400).json(STATUS_CODE[400]({ errors }));
}

/**
 * Convenience wrapper. Accepts any number of express-validator ValidationChain
 * instances (or already-built middleware arrays) and appends the shared
 * handleValidationErrors at the end.
 */
export function validate(
  ...chains: Array<ValidationChain | ValidationChain[]>
): Array<ValidationChain | typeof handleValidationErrors> {
  const flattened: ValidationChain[] = [];
  for (const c of chains) {
    if (Array.isArray(c)) flattened.push(...c);
    else flattened.push(c);
  }
  return [...flattened, handleValidationErrors];
}
