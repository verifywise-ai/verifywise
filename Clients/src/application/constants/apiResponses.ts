export type ApiResponse = {
  message: string;
  redirect?: string;
  variant: "success" | "error" | "warning";
  logType: "info" | "error" | "event";
};

export type StatusCode = 201 | 400 | 409 | 500;

export const ALERT_TIMEOUT = 3000;

export const SUCCESS_RESPONSE = {
  message: "Account created successfully. Redirecting to login...",
  redirect: "/login",
  variant: "success" as const,
  logType: "info" as const,
};

export const ERROR_RESPONSE = {
  message: "Bad request. Please check your input.",
  variant: "error" as const,
  logType: "error" as const,
};

export const ALREADY_EXISTS_RESPONSE = {
  message: "Account already exists.",
  variant: "warning" as const,
  logType: "event" as const,
};

export const INTERNAL_SERVER_ERROR_RESPONSE = {
  message: "Internal server error. Please try again later.",
  variant: "error" as const,
  logType: "error" as const,
};

export const UNEXPECTED = {
  message: "Unexpected response. Please try again.",
  variant: "error" as const,
  logType: "error" as const,
};

export const API_RESPONSES: { [key: number]: ApiResponse } = {
  201: SUCCESS_RESPONSE,
  400: ERROR_RESPONSE,
  409: ALREADY_EXISTS_RESPONSE,
  500: INTERNAL_SERVER_ERROR_RESPONSE,
};
