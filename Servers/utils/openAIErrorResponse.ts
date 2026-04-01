/**
 * OpenAI-compatible error response helper.
 * Used by virtual key middleware and proxy controllers.
 */

import { Response } from "express";

export function openAIError(
  res: Response,
  status: number,
  message: string,
  type: string,
  code: string
) {
  return res.status(status).json({
    error: { message, type, code },
  });
}
