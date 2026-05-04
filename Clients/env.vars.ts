export const ENV_VARs = {
  URL:
    import.meta.env.VITE_APP_API_BASE_URL ?? // keep empty string if set
    (typeof window !== "undefined" // only run in browser
      ? `${window.location.protocol}//${window.location.hostname}:${window.location.port}`
      : "http://localhost:3000/"), // final Node/SSR fallback
  IS_DEMO_APP: import.meta.env.VITE_IS_DEMO_APP === "true",
  IS_MULTI_TENANT: import.meta.env.VITE_IS_MULTI_TENANT === "true",
  CLIENT_ID: import.meta.env.VITE_SLACK_CLIENT_ID ?? "9505327005334.9509956753907",
  SLACK_URL: import.meta.env.VITE_SLACK_URL ?? "https://slack.com/oauth/v2/authorize",
  IS_SLACK_VISIBLE: import.meta.env.VITE_IS_SLACK_VISIBLE ?? "true",
};
