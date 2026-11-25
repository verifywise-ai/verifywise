/**
 * The app's address for links in notices and emails: FRONTEND_URL, or the
 * local frontend (Vite, port 5173) when it is not set. Never the backend's
 * address, which would open the API instead of the page.
 */
export const frontendBaseUrl = (): string => process.env.FRONTEND_URL || "http://localhost:5173";
