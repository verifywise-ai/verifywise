import { NextFunction, Request, Response } from "express";
import { getTokenPayload } from "../utils/jwt.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";

const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: "Token not found",
      }),
    );
  }

  try {
    // Verify JWT signature and decode payload
    const decoded = getTokenPayload(token);

    if (!decoded)
      return res.status(401).json(
        STATUS_CODE[401]({
          message: "Unauthorized **",
        }),
      );

    // Check token expiration
    if (decoded.expire < Date.now())
      return res.status(406).json(
        STATUS_CODE[406]({
          message:
            "This invitation link is expired. You need to be invited again to gain access to the dashboard",
        }),
      );

    if (!decoded.email) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: "Invalid token payload",
        }),
      );
    }

    if (decoded.email !== req.body.email) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: "Token email does not match request email",
        }),
      );
    }

    // Proceed to next middleware or route handler
    next();
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export default resetPassword;
