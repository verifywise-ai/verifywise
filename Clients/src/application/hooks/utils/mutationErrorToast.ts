import { showAlert } from "../../tools/alertUtils";

/**
 * Shows a global error toast for a failed mutation.
 *
 * The axios response interceptor (customAxios.showGlobalErrorAlert) already
 * toasts 5xx and network failures, so those are skipped here to avoid double
 * toasts — this helper only surfaces errors the interceptor does not cover
 * (e.g. 4xx responses).
 *
 * @param {unknown} error - The mutation error (axios error or APIError)
 * @param {string} fallbackMessage - Message shown when the error has no usable message
 */
export function showMutationErrorToast(error: unknown, fallbackMessage: string): void {
  const axiosError = error as { response?: { status?: number }; message?: string };
  const apiError = error as { status?: number };
  const status = axiosError?.response?.status ?? apiError?.status;

  const isServerError = status != null && status >= 500;
  // Matches the interceptor's network-error check: no response at all.
  const isNetworkError = status == null && axiosError?.response == null;
  if (isServerError || isNetworkError) return;

  showAlert({
    variant: "error",
    title: "Error",
    body: fallbackMessage,
  });
}
