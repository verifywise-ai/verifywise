/** HTTP status of a failed request: an AxiosError carries it as `status` and `response.status`. */
const statusOf = (error: unknown): number | undefined => {
  const err = error as { status?: number; response?: { status?: number } } | null;
  return err?.status ?? err?.response?.status;
};

/**
 * True for a 4xx other than a request timeout (408). Those fail the same way
 * on a retry, and a retried 429 spends the per-IP rate limit again, keeping it
 * exhausted for everyone behind that address.
 */
export const isFinalClientError = (error: unknown): boolean => {
  const status = statusOf(error);
  return status !== undefined && status >= 400 && status < 500 && status !== 408;
};

/**
 * Query retry policy: up to `maxRetries` retries for a server or network
 * failure or a timeout, none for any other 4xx.
 */
export const retryUpTo =
  (maxRetries: number) =>
  (failureCount: number, error: unknown): boolean =>
    !isFinalClientError(error) && failureCount < maxRetries;
