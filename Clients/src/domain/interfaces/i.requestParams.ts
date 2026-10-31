export interface RequestParams {
  routeUrl: string;
  body?: any;
  signal?: AbortSignal;
  authToken?: string;
  headers?: any;
  /** Skip the global error toast; the caller shows its own message. */
  suppressGlobalErrorToast?: boolean;
}

export interface GetRequestParams extends RequestParams {
  responseType?: "json" | "blob";
}
