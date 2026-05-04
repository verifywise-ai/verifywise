import { NextFunction, Request, Response } from "express";
import { check, validationResult } from "express-validator";

export const validateId = (paramName = "id") => [
  check(paramName).isInt({ min: 1 }).withMessage(`${paramName} must be a positive integer`),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    return next();
  },
];
