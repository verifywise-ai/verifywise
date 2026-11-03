import CustomException from "../../../../infrastructure/exceptions/customeException";

/** The message the server sent with a failed request, if any. */
export function serverErrorMessage(err: unknown): string | null {
  if (!(err instanceof CustomException) || !err.status) return null;
  const payload = err.response?.data;
  if (typeof payload === "string" && payload.trim()) return payload;
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  return null;
}
