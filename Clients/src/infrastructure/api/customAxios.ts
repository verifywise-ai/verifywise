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
 * - Logs appropriate error messages based on the status code or the type of error encountered.
 *
 * This setup ensures that all HTTP requests made using this custom Axios instance are consistent in terms of configuration and error handling.
 */

import axios, { AxiosError } from "axios";
import { store } from "../../application/redux/store";
import { ENV_VARs } from "../../../env.vars";
import { clearAuthState, setAuthToken } from "../../application/redux/auth/authSlice";
import { storageService } from "../storage";
import { AlertProps } from "../../presentation/types/alert.types";
import { translations, type Lang } from "../../i18n/translations";
import { getLanguage } from "../../i18n/domTranslator";
import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  QueuedRequest,
  RefreshTokenResponse,
  RetriableRequestConfig,
} from "./api.types";

const performLogout = () => {
  store.dispatch(clearAuthState());
  window.location.href = "/login";
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
// Looks up the current language from the DOM translator and falls back to the
// English source key when no translation is available.
const translate = (key: string): string => {
  const lang: Lang = getLanguage();
  if (lang === "en") return key;
  return translations[lang]?.[key] || key;
};

// Show a translated error toast for server or network failures.
// 4xx errors are intentionally left for callers/UI layers to handle.
const showGlobalErrorAlert = (error: AxiosError) => {
  // A canceled request carries no response, but it is not a failure: the caller
  // unmounted or superseded it (the assessment hooks abort on effect cleanup).
  // Without this guard, switching tabs mid-request shows a bogus error toast.
  if (axios.isCancel(error) || error.code === "ERR_CANCELED") return;

  const status = error.response?.status;
  const isServerError = status != null && status >= 500;
  const isNetworkError = error.response == null;

  // DEBUG: log every global alert trigger so we can identify the failing request
  // eslint-disable-next-line no-console
  console.error("[customAxios global alert]", {
    url: error.config?.url,
    method: error.config?.method,
    status,
    statusText: error.response?.statusText,
    message: error.message,
    responseData: (error.response as any)?.data,
    code: (error as any).code,
  });

  if (isServerError || isNetworkError) {
    showAlert({
      variant: "error",
      title: translate("Error"),
      body: translate("An error occurred. Please try again later"),
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
    if (
      token &&
      !(config.url?.includes("/users/reset-password") || config.url?.includes("/users/register"))
    ) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach X-Organization-Id header when super-admin is viewing an org
    const activeOrgId = state.auth.activeOrganizationId;
    if (activeOrgId) {
      config.headers["X-Organization-Id"] = String(activeOrgId);
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
    // Don't transform 404 errors - let them through as AxiosErrors so status is preserved
    // This allows downstream code to handle 404s differently (e.g., as empty state vs error)
    // if (error.response?.status === 404) {
    //   const errorMessage = responseData?.message || 'Not found';
    //   return Promise.reject(new Error(errorMessage));
    // }

    if (
      error.response?.status === 403 &&
      (responseData.message === "User does not belong to this organization" ||
        responseData.message === "Not allowed to access")
    ) {
      if (showAlertCallback) {
        showAlertCallback({
          variant: "info",
          title: "Access Denied",
          body: "Please login again to continue.",
        });
      }
      setTimeout(() => {
        performLogout();
      }, 1000);
      return Promise.reject(new Error(responseData?.message || "Forbidden"));
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
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return CustomAxios(originalRequest);
          })
          .catch((err: unknown) => {
            // If refresh token fails, redirect to login
            if (axios.isAxiosError(err) && err.response?.status === 406) {
              store.dispatch(setAuthToken(""));
            }
            return Promise.reject(err);
          });
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
        // If refresh token request fails with 406, redirect to login
        if (axios.isAxiosError(refreshError) && refreshError.response?.status === 406) {
          store.dispatch(setAuthToken(""));
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Surface generic translated error toasts for server and network failures.
    // Auth-specific errors (403/429/406) are handled above and return early.
    showGlobalErrorAlert(error);

    return Promise.reject(error);
  },
);

export default CustomAxios;
