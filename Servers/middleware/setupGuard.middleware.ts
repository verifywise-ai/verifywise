import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { checkUserExistsQuery } from "../utils/user.utils";

/**
 * Blocks the request if the system already has at least one user.
 *
 * Use this on public first-setup endpoints (e.g. the initial organization
 * registration route) so they can only be used while the system is still
 * uninitialized.
 */
export const requireSystemNotInitialized = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  try {
    const userExists = await checkUserExistsQuery();
    if (userExists) {
      return res.status(403).json(
        STATUS_CODE[403]({
          message: req.t!("System is already initialized. Registration is closed."),
        }),
      );
    }
    next();
  } catch (error) {
    console.error("Error in requireSystemNotInitialized middleware:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

/**
 * Blocks the request if the system has not been initialized yet.
 *
 * This is the inverse guard for endpoints that should only work once at least
 * one user exists.
 */
export const requireSystemInitialized = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  try {
    const userExists = await checkUserExistsQuery();
    if (!userExists) {
      return res.status(403).json(
        STATUS_CODE[403]({
          message: req.t!("System is not initialized. Please complete setup first."),
        }),
      );
    }
    next();
  } catch (error) {
    console.error("Error in requireSystemInitialized middleware:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
