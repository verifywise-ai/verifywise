/**
 * @file customAxios.ts
 * @description This file sets up a custom Axios instance with default configurations, including base URL, timeout, and headers.
 * It also includes request and response interceptors to handle authorization tokens and error responses.
 *
 * The custom Axios instance is configured with:
 * - A base URL that defaults to "http://localhost:3000" but can be overridden by the environment variable `REACT_APP_BASE_URL`.
 * - A timeout limit of 120,000 milliseconds for requests.
 * - Default headers for "Content-Type" and "Accept" set to "application/json".
 *
 * The request interceptor:
 * - Retrieves the authorization token from the Redux store.
 * - Adds the token to the request headers if it exists.
 *
 * The response interceptor:
 * - Handles specific HTTP status codes such as 401 (Unauthorized), 403 (Forbidden), and 500 (Server Error).
 * - Handles 406 status code by attempting to refresh the token and retrying the original request.
 * - Surfaces translated error toasts for 4xx/5xx and network failures, consuming the
 *   standardized `{ message, data }` error envelope.
 *
 * This setup ensures that all HTTP requests made using this custom Axios instance are consistent in terms of configuration and error handling.
 */

import axios, { AxiosError } from "axios";
import { store } from "../../application/redux/store";
import { ENV_VARs } from "../../../env.vars";
import { setAuthToken } from "../../application/redux/auth/authSlice";
import { clearSession, endSessionAndReload } from "../../application/utils/clearSession";
import { storageService } from "../storage";
import { AlertProps } from "../../presentation/types/alert.types";
import { translateKey } from "../../i18n/domTranslator";
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  QueuedRequest,
  RefreshTokenResponse,
  RetriableRequestConfig,
} from "./api.types";

/**
 * Refresh answers that mean the session cannot be renewed: 400 (no refresh
 * cookie), 401 (revoked or invalid), 406 (expired). The refresh endpoint's
 * only 403 is the CSRF check, which says nothing about the refresh token.
 */
const SESSION_ENDED_STATUSES = [400, 401, 406];

/** How long the "Session Expired" message stays up before the reload. */
const SESSION_EXPIRED_RELOAD_DELAY_MS = 1500;

/**
 * The auth middleware's 403 details that end the session, as the server
 * translates them (en, de, fr).
 */
const SESSION_DENIED_DETAILS = [
  "User does not belong to this organization",
  "Benutzer gehört nicht zu dieser Organisation",
  "L'utilisateur n'appartient pas à cette organisation",
  "Not allowed to access",
  "Zugriff nicht erlaubt",
  "Accès non autorisé",
];

// Several requests can fail at once: end the session (and alert) once.
let isLoggingOut = false;

/**
 * True if this caller should end the session: none is ending yet, and there
 * is still a token. Responses that land after the session was cleared (the
 * page is reloading) are ignored.
 */
const claimLogout = () => {
  if (isLoggingOut || !store.getState()?.auth?.authToken) return false;
  isLoggingOut = true;
  return true;
};

/** True while a forced logout is under way (the page is about to reload). */
export const isSessionEnding = () => isLoggingOut;

const performLogout = async () => {
  try {
    await endSessionAndReload(store.dispatch);
  } finally {
    isLoggingOut = false;
  }
};

// Create a global callback for showing alerts
let showAlertCallback: ((alert: AlertProps) => void) | null = null;

// Function to set the alert callback
export const setShowAlertCallback = (callback: (alert: AlertProps) => void) => {
  showAlertCallback = callback;
};

// Function to show an alert using the callback
export const showAlert = (alert: AlertProps) => {
  if (showAlertCallback) {
    showAlertCallback(alert);
  }
};

// Lightweight translation helper for non-React infrastructure code.
// Reads the dictionary currently loaded by the DOM translator and falls back
// to the English source key when no translation is available.
const translate = (key: string): string => translateKey(key);

// Extract the human-readable detail from the standardized error envelope:
// 1xx-4xx responses carry it in `data` (a string, or an object with
// `message`/`error`), 5xx responses in `error`; top-level `message` is the
// final fallback (reason phrase, or the raw message from legacy responses).
const getEnvelopeErrorMessage = (data: ApiErrorEnvelope): string | undefined => {
  if (typeof data.data === "string") return data.data;
  if (data.data && typeof data.data === "object") {
    const inner = data.data as { message?: unknown; error?: unknown };
    if (typeof inner.message === "string") return inner.message;
    if (typeof inner.error === "string") return inner.error;
  }
  if (typeof data.error === "string") return data.error;
  return data.message;
};

// Endpoints whose UI already renders its own error message (e.g. the login
// page shows an inline alert). Skip the global toast for these so users don't
// see duplicate notifications.
const ENDPOINTS_WITH_CUSTOM_ERROR_UI = ["/users/login"];

// Endpoints authorized by the token in an emailed link (invitation, password
// reset), which the page sends itself, not by the session token.
const LINK_TOKEN_ENDPOINTS = ["/users/reset-password", "/users/register"];

const isLinkTokenEndpoint = (url: string | undefined) =>
  LINK_TOKEN_ENDPOINTS.some((path) => url?.includes(path) ?? false);

// The auth middleware's answer to a request sent without a token, as the
// server translates it (en, de, fr).
const TOKEN_NOT_FOUND_DETAILS = ["Token not found", "Token nicht gefunden", "Jeton introuvable"];

/**
 * True for a failure that only says the session is over, once it has been
 * cleared (logout, forced logout): a request sent with the old session token
 * that lands afterwards, or a query refetching after the cache was emptied,
 * which goes out with no token and gets the auth middleware's "Token not
 * found". These are not shown, and do not try to refresh the token. Errors
 * from requests sent while signed out (login, registration, password reset)
 * are not affected.
 */
const isAfterSessionCleared = (
  error: AxiosError,
  request: RetriableRequestConfig | undefined,
  detail: string | undefined,
) => {
  if (store.getState()?.auth?.authToken) return false;
  if (request?._sentWithSession) return true;
  return (
    error.response?.status === 400 &&
    !isLinkTokenEndpoint(request?.url) &&
    detail !== undefined &&
    TOKEN_NOT_FOUND_DETAILS.includes(detail)
  );
};

// Show a translated error toast for server or network failures, and for 4xx
// client errors using the backend's message from the { message, data }
// envelope. 404 is excluded: callers deliberately handle it as empty state.
const showGlobalErrorAlert = (error: AxiosError) => {
  // A canceled request carries no response, but it is not a failure: the caller
  // unmounted or superseded it (the assessment hooks abort on effect cleanup).
  // Without this guard, switching tabs mid-request shows a bogus error toast.
  if (axios.isCancel(error) || error.code === "ERR_CANCELED") return;

  const requestUrl = error.config?.url ?? "";
  if (ENDPOINTS_WITH_CUSTOM_ERROR_UI.some((path) => requestUrl.includes(path))) return;

  const status = error.response?.status;
  const isServerError = status != null && status >= 500;
  const isNetworkError = error.response == null;
  const isClientError = status != null && status >= 400 && status < 500 && status !== 404;

  if (isServerError || isNetworkError) {
    showAlert({
      variant: "error",
      title: translate("Error"),
      body: translate("An error occurred. Please try again later"),
    });
    return;
  }

  if (isClientError) {
    const responseData = (error.response?.data ?? {}) as ApiErrorEnvelope;
    const detail = getEnvelopeErrorMessage(responseData);
    showAlert({
      variant: "error",
      title: translate("Error"),
      body: translate(detail ?? "An error occurred. Please try again later"),
    });
  }
};

// Create an instance of axios with default configurations
const CustomAxios = axios.create({
  baseURL: `${ENV_VARs.URL}/api`,
  timeout: 120000,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  // Don't send credentials by default
  withCredentials: false,
});

// Flag to prevent multiple refresh token requests
let isRefreshing = false;
// Store pending requests that should be retried after token refresh
let failedQueue: QueuedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Read a cookie value by name (used for the non-httpOnly CSRF cookie).
const getCookieValue = (name: string): string | null => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

// Request interceptor to handle both authorization token and credentials
CustomAxios.interceptors.request.use(
  (config) => {
    // Add authorization token
    const state = store.getState();
    const token = state.auth.authToken;
    if (token && !isLinkTokenEndpoint(config.url)) {
      config.headers.Authorization = `Bearer ${token}`;
      (config as RetriableRequestConfig)._sentWithSession = true;
    }

    const lang = storageService.get("language", "en");
    if (lang) {
      config.headers["Accept-Language"] = lang;
    }

    // Enable credentials for auth-related endpoints
    if (config.url?.includes("/users/login") || config.url?.includes("/users/refresh-token")) {
      config.withCredentials = true;
    }

    // Double-submit-cookie CSRF: echo the csrfToken cookie in the header so
    // cookie-authenticated state-changing requests (refresh-token, logout)
    // pass the server-side CSRF middleware. Harmless on all other requests.
    try {
      const csrfToken = getCookieValue("csrfToken");
      if (csrfToken) {
        config.headers["x-csrf-token"] = csrfToken;
      }
    } catch {
      // document.cookie unavailable in sandboxed contexts.
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor to handle responses and errors
CustomAxios.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig;
    const responseData = (error.response?.data ?? {}) as ApiErrorEnvelope;
    // The standardized envelope carries the human-readable detail in `data`
    // for 4xx (top-level `message` is the HTTP reason phrase); legacy/raw
    // bodies are still matched via the `message` fallback.
    const errorDetail = getEnvelopeErrorMessage(responseData);
    // Don't transform 404 errors - let them through as AxiosErrors so status is preserved
    // This allows downstream code to handle 404s differently (e.g., as empty state vs error)
    // if (error.response?.status === 404) {
    //   const errorMessage = responseData?.message || 'Not found';
    //   return Promise.reject(new Error(errorMessage));
    // }

    if (
      error.response?.status === 403 &&
      errorDetail !== undefined &&
      SESSION_DENIED_DETAILS.includes(errorDetail)
    ) {
      if (claimLogout()) {
        if (showAlertCallback) {
          showAlertCallback({
            variant: "info",
            title: "Access Denied",
            body: "Please login again to continue.",
          });
        }
        setTimeout(() => {
          void performLogout();
        }, 1000);
      }
      return Promise.reject(new Error(errorDetail || "Forbidden"));
    }

    // If the auth/refresh limiter has been tripped (429), stop the retry
    // cascade and surface a clear message instead of letting calls keep
    // hammering the refresh endpoint.
    if (error.response?.status === 429 && originalRequest.url === "/users/refresh-token") {
      isRefreshing = false;
      processQueue(error, null);
      if (showAlertCallback) {
        showAlertCallback({
          variant: "warning",
          title: "Too many attempts",
          body: "Too many requests in a short time. Please wait a moment and refresh the page.",
        });
      }
      return Promise.reject(error);
    }

    // The session was cleared after this request went out: no refresh, no toast.
    if (isAfterSessionCleared(error, originalRequest, errorDetail)) {
      return Promise.reject(error);
    }

    // If error is 406 (Token Expired) and we haven't tried to refresh yet
    if (error.response?.status === 406 && !originalRequest._retry) {
      // If this is the refresh token request itself returning 406
      if (originalRequest.url === "/users/refresh-token") {
        // Show alert using the callback
        if (showAlertCallback) {
          showAlertCallback({
            variant: "warning",
            title: "Session Expired",
            body: "Please login again to continue.",
          });
        }
        return Promise.reject(error);
      }

      // For other APIs returning 406, try to refresh the token
      if (isRefreshing) {
        return new Promise<string | null>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return CustomAxios(originalRequest);
        });
        // A failed refresh rejects the queue; the request that ran the
        // refresh has already cleared the session.
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await CustomAxios.post<ApiSuccessEnvelope<RefreshTokenResponse>>(
          `/users/refresh-token`,
          {},
          { withCredentials: true },
        );

        if (response.status === 200) {
          const newToken = response.data.data.token;
          store.dispatch(setAuthToken(newToken));
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
          return CustomAxios(originalRequest);
        }
      } catch (refreshError: unknown) {
        processQueue(refreshError, null);
        // The refresh token is expired, revoked or missing: end the session.
        // A 5xx or network failure leaves it for the next request to retry.
        const status = axios.isAxiosError(refreshError) ? refreshError.response?.status : undefined;
        if (status !== undefined && SESSION_ENDED_STATUSES.includes(status) && claimLogout()) {
          // A 406 already showed "Session Expired" on the refresh call itself.
          if (status !== 406 && showAlertCallback) {
            showAlertCallback({
              variant: "warning",
              title: "Session Expired",
              body: "Please login again to continue.",
            });
          }
          // Drop the token now, so retries and clicks in the meantime cannot
          // start another refresh; only the reload waits, so the message
          // can be read.
          clearSession(store.dispatch);
          setTimeout(() => {
            void performLogout();
          }, SESSION_EXPIRED_RELOAD_DELAY_MS);
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Surface generic translated error toasts for server and network failures.
    // Auth-specific errors (403/429/406) are handled above and return early.
    // A rejected refresh ends the session (the request that ran it reloads
    // to /login); its own error is not shown.
    if (
      originalRequest?.url === "/users/refresh-token" &&
      error.response?.status !== undefined &&
      SESSION_ENDED_STATUSES.includes(error.response.status)
    ) {
      return Promise.reject(error);
    }

    showGlobalErrorAlert(error);

    return Promise.reject(error);
  },
);

export default CustomAxios;
