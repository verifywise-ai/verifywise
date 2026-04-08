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

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { store } from "../../application/redux/store";
import { ENV_VARs } from "../../../env.vars";
import { clearAuthState, setAuthToken } from "../../application/redux/auth/authSlice";
import { AlertProps } from "../../presentation/types/alert.types";

const performLogout = () => {
  store.dispatch(clearAuthState());
  window.location.href = '/login';
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

// Create an instance of axios with default configurations
const CustomAxios = axios.create({
  baseURL: `${ENV_VARs.URL}/api`,
  timeout: 120000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  // Don't send credentials by default
  withCredentials: false,
});

// Flag to prevent multiple refresh token requests
let isRefreshing = false;
// Store pending requests that should be retried after token refresh
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor to handle both authorization token and credentials
CustomAxios.interceptors.request.use(
  (config) => {
    // Add authorization token
    const state = store.getState();
    const token = state.auth.authToken;
    if (token && !(config.url?.includes('/users/reset-password') || config.url?.includes('/users/register'))) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach X-Organization-Id header when super-admin is viewing an org
    const activeOrgId = state.auth.activeOrganizationId;
    if (activeOrgId) {
      config.headers['X-Organization-Id'] = String(activeOrgId);
    }

    // Enable credentials for auth-related endpoints
    if (config.url?.includes('/users/login') || config.url?.includes('/users/refresh-token')) {
      config.withCredentials = true;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle responses and errors
CustomAxios.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const responseData = (error.response?.data as { message?: string })
    // Don't transform 404 errors - let them through as AxiosErrors so status is preserved
    // This allows downstream code to handle 404s differently (e.g., as empty state vs error)
    // if (error.response?.status === 404) {
    //   const errorMessage = responseData?.message || 'Not found';
    //   return Promise.reject(new Error(errorMessage));
    // }

    if (
      error.response?.status === 403 &&
      (
        responseData.message === 'User does not belong to this organization' ||
        responseData.message === 'Not allowed to access'
      )
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
      return Promise.reject(new Error(responseData?.message || 'Forbidden'));
    }

    // If error is 406 (Token Expired) and we haven't tried to refresh yet
    if (error.response?.status === 406 && !originalRequest._retry) {
      // If this is the refresh token request itself returning 406
      if (originalRequest.url === '/users/refresh-token') {
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
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return CustomAxios(originalRequest);
          })
          .catch((err) => {
            // If refresh token fails, redirect to login
            if (err.response?.status === 406) {
              store.dispatch(setAuthToken(""));
            }
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await CustomAxios.post(
          `/users/refresh-token`,
          {},
          { withCredentials: true }
        );

        if (response.status === 200) {
          const newToken = response.data.data.token;
          store.dispatch(setAuthToken(newToken));
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          processQueue(null, newToken);
          return CustomAxios(originalRequest);
        }
      } catch (refreshError: any) {
        processQueue(refreshError, null);
        // If refresh token request fails with 406, redirect to login
        if (refreshError.response?.status === 406) {
          store.dispatch(setAuthToken(""));
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default CustomAxios;
