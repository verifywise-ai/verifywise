/**
 * @file api.types.ts
 * @description Shared request/response DTO types for the infrastructure API layer.
 *
 * These types replace ad-hoc `any` usage across the Axios instance, the
 * `apiServices` wrapper, and the repository layer. They model the two envelope
 * shapes the backend returns:
 *
 * - Success responses wrap the payload as `{ message, data }` (see STATUS_CODE helpers).
 * - Error responses surface a message under one of `message`, `error`, or a
 *   string `data` (validation errors from STATUS_CODE[400]).
 */

import type { AxiosResponseHeaders, InternalAxiosRequestConfig } from "axios";

/**
 * Standard success envelope returned by the backend. The concrete payload type
 * is supplied by the caller via the generic parameter.
 */
export interface ApiSuccessEnvelope<T = unknown> {
  message?: string;
  data: T;
}

/**
 * Error payload shape found on `error.response.data`. All fields are optional
 * because different backend code paths populate different ones:
 * - `message`: standard error message
 * - `error`: alternative error message field
 * - `data`: validation errors (string) from STATUS_CODE[400]
 */
export interface ApiErrorEnvelope {
  message?: string;
  error?: string;
  data?: unknown;
}

/**
 * Payload of a successful `/users/refresh-token` response.
 */
export interface RefreshTokenResponse {
  token: string;
}

/**
 * Query parameters and per-request config accepted by the `apiServices`
 * helpers. Indexed string keys carry query params; the listed fields are
 * extracted as Axios request options rather than serialized as params.
 */
export interface RequestParams {
  signal?: AbortSignal;
  /**
   * Axios `responseType` accepted as a plain string for caller convenience;
   * normalized to Axios's `ResponseType` at the request boundary in `get()`.
   */
  responseType?: string;
  // `undefined` values are permitted so callers can drop a default header
  // (e.g. `"Content-Type": undefined` for multipart uploads).
  headers?: Record<string, string | undefined>;
  [key: string]: unknown;
}

/**
 * Normalized response returned by the `apiServices` helpers.
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers?: AxiosResponseHeaders;
}

/**
 * Axios request config extended with the `_retry` guard used by the
 * refresh-token interceptor to prevent infinite retry loops.
 */
export type RetriableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

/**
 * A request parked in the refresh queue while a token refresh is in flight.
 * `resolve` receives the new bearer token (or `null` when unavailable);
 * `reject` receives the originating error.
 */
export interface QueuedRequest {
  resolve: (token: string | null) => void;
  reject: (reason: unknown) => void;
}
