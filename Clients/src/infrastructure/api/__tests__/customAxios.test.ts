import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../env.vars", () => ({
  ENV_VARs: { URL: "http://localhost:3000" },
}));

vi.mock("../../../application/redux/store", () => ({
  store: {
    getState: vi.fn(),
    dispatch: vi.fn(),
  },
}));

vi.mock("../../../application/redux/auth/authSlice", () => ({
  clearAuthState: vi.fn(() => ({ type: "auth/clearAuthState" })),
  setAuthToken: vi.fn((token: string) => ({ type: "auth/setAuthToken", payload: token })),
}));

vi.mock("../../../i18n/domTranslator", () => ({
  getLanguage: vi.fn(() => "en"),
}));

vi.mock("../../../i18n/translations", () => ({
  translations: {
    de: {
      "Error": "Fehler",
      "An error occurred. Please try again later":
        "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut",
    },
  },
}));

import CustomAxios, { showAlert, setShowAlertCallback } from "../customAxios";
import { store } from "../../../application/redux/store";
import { getLanguage } from "../../../i18n/domTranslator";

const mockStore = vi.mocked(store);

describe("customAxios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setShowAlertCallback(null as any);
    mockStore.getState.mockReturnValue({
      auth: { authToken: "test-token", activeOrganizationId: null },
    } as any);
  });

  describe("request interceptor", () => {
    it("adds Authorization header when token exists", async () => {
      const config = await (CustomAxios.interceptors.request as any).handlers[0].fulfilled({
        headers: {} as any,
        url: "/some-endpoint",
      });
      expect(config.headers.Authorization).toBe("Bearer test-token");
    });

    it("does not add Authorization header for reset-password endpoint", async () => {
      const config = await (CustomAxios.interceptors.request as any).handlers[0].fulfilled({
        headers: {} as any,
        url: "/users/reset-password",
      });
      expect(config.headers.Authorization).toBeUndefined();
    });

    it("does not add Authorization header for register endpoint", async () => {
      const config = await (CustomAxios.interceptors.request as any).handlers[0].fulfilled({
        headers: {} as any,
        url: "/users/register",
      });
      expect(config.headers.Authorization).toBeUndefined();
    });

    it("adds X-Organization-Id header when activeOrganizationId exists", async () => {
      mockStore.getState.mockReturnValue({
        auth: { authToken: "token", activeOrganizationId: 5 },
      } as any);

      const config = await (CustomAxios.interceptors.request as any).handlers[0].fulfilled({
        headers: {} as any,
        url: "/some-endpoint",
      });
      expect(config.headers["X-Organization-Id"]).toBe("5");
    });

    it("sets withCredentials for login endpoint", async () => {
      const config = await (CustomAxios.interceptors.request as any).handlers[0].fulfilled({
        headers: {} as any,
        url: "/users/login",
      });
      expect(config.withCredentials).toBe(true);
    });
  });

  describe("showAlert / setShowAlertCallback", () => {
    it("does nothing when no callback is set", () => {
      setShowAlertCallback(null as any);
      expect(() => showAlert({ variant: "error", body: "test" })).not.toThrow();
    });

    it("calls the callback when set", () => {
      const callback = vi.fn();
      setShowAlertCallback(callback);
      showAlert({ variant: "success", body: "Done" });
      expect(callback).toHaveBeenCalledWith({ variant: "success", body: "Done" });
    });
  });

  describe("response interceptor global error toast", () => {
    const rejected = (CustomAxios.interceptors.response as any).handlers[0].rejected;

    it("shows a translated error toast for HTTP 5xx responses", async () => {
      const callback = vi.fn();
      setShowAlertCallback(callback);

      const error = {
        config: { url: "/test" },
        response: { status: 500, data: { message: "Server error" } },
        message: "Internal Server Error",
      };

      await expect(rejected(error)).rejects.toEqual(error);
      expect(callback).toHaveBeenCalledWith({
        variant: "error",
        title: "Error",
        body: "An error occurred. Please try again later",
      });
    });

    it("shows a translated error toast for network errors", async () => {
      const callback = vi.fn();
      setShowAlertCallback(callback);

      const error = {
        config: { url: "/test" },
        response: undefined,
        request: {},
        message: "Network Error",
      };

      await expect(rejected(error)).rejects.toEqual(error);
      expect(callback).toHaveBeenCalledWith({
        variant: "error",
        title: "Error",
        body: "An error occurred. Please try again later",
      });
    });

    it("translates the toast body when the active language is not English", async () => {
      vi.mocked(getLanguage).mockReturnValue("de");
      const callback = vi.fn();
      setShowAlertCallback(callback);

      const error = {
        config: { url: "/test" },
        response: { status: 503, data: {} },
        message: "Service Unavailable",
      };

      await expect(rejected(error)).rejects.toEqual(error);
      expect(callback).toHaveBeenCalledWith({
        variant: "error",
        title: "Fehler",
        body: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut",
      });
    });

    it("does not show a toast for 4xx client errors", async () => {
      const callback = vi.fn();
      setShowAlertCallback(callback);

      const error = {
        config: { url: "/test" },
        response: { status: 400, data: { message: "Bad request" } },
        message: "Bad Request",
      };

      await expect(rejected(error)).rejects.toEqual(error);
      expect(callback).not.toHaveBeenCalled();
    });
  });
});
