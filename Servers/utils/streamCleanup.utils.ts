/**
 * Stream cleanup utility for SSE proxy responses.
 * Shared between JWT-authenticated and virtual key proxy controllers.
 */

import { Readable } from "stream";
import { Request, Response } from "express";
import logger from "./logger/fileLogger";

/**
 * Pipe a Node.js Readable stream to an Express response with proper cleanup.
 * Sets SSE headers, handles stream end/error, and client disconnect.
 */
export function pipeStreamWithCleanup(
  stream: Readable,
  req: Request,
  res: Response,
  cleanup: () => Promise<void>
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  stream.pipe(res);

  let cleanedUp = false;
  const doCleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await cleanup();
  };

  stream.on("end", doCleanup);
  stream.on("error", async (err) => {
    logger.error("Stream error:", err);
    await doCleanup();
    if (!res.headersSent) {
      res.status(500).end();
    }
  });

  req.on("close", async () => {
    if (!res.writableEnded) {
      stream.destroy();
      await doCleanup();
    }
  });
}
