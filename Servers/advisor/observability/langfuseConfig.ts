/**
 * Phase 3 — Langfuse Configuration
 *
 * Initializes the Langfuse client for tracing agent executions.
 */

import Langfuse from "langfuse";
import { logStructured } from "../../utils/logger/fileLogger";

const fileName = "langfuseConfig.ts";

let langfuseClient: Langfuse | null = null;

/**
 * Get or create the Langfuse client.
 * Returns null if Langfuse is not configured (missing env vars).
 */
export function getLangfuse(): Langfuse | null {
  if (langfuseClient) return langfuseClient;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_HOST || "https://cloud.langfuse.com";

  if (!publicKey || !secretKey) {
    logStructured(
      "successful",
      "Langfuse not configured (missing LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY), tracing disabled",
      "getLangfuse",
      fileName,
    );
    return null;
  }

  try {
    langfuseClient = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 15,
      flushInterval: 10000,
    });

    logStructured("successful", `Langfuse initialized (host: ${baseUrl})`, "getLangfuse", fileName);
    return langfuseClient;
  } catch (error) {
    logStructured("error", `Langfuse init failed: ${error}`, "getLangfuse", fileName);
    return null;
  }
}

/**
 * Flush pending traces and shutdown.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (langfuseClient) {
    await langfuseClient.shutdownAsync();
    langfuseClient = null;
  }
}
