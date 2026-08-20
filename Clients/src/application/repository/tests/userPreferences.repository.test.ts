import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getUserPreferencesByUserId,
  getCurrentUserPreferences,
  createNewUserPreferences,
  updateUserPreferencesById,
  updateCurrentUserPreferences,
} from "../userPreferences.repository";
import { UserDateFormat } from "../../../domain/enums/userDateFormat.enum";

vi.mock("../../../infrastructure/api/networkServices", () => {
  return {
    apiServices: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("userPreferences.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("getCurrentUserPreferences", () => {
    it("should make GET request to /users/me/preferences", async () => {
      const mockResponse = {
        data: {
          date_format: UserDateFormat.DD_MM_YYYY_DASH,
          language: "en",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getCurrentUserPreferences();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/users/me/preferences");
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe("updateCurrentUserPreferences", () => {
    it("should make PATCH request to /users/me/preferences with data", async () => {
      const mockResponse = {
        data: {
          date_format: UserDateFormat.MM_DD_YYYY_DASH,
          language: "de",
        },
        status: 200,
        statusText: "OK",
      };

      const data = {
        date_format: UserDateFormat.MM_DD_YYYY_DASH,
        language: "de" as const,
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateCurrentUserPreferences(data);

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/users/me/preferences", data);
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw when the API call fails", async () => {
      vi.mocked(apiServices.patch).mockRejectedValue(new Error("Connection refused"));

      await expect(
        updateCurrentUserPreferences({ date_format: UserDateFormat.DD_MM_YYYY_DASH }),
      ).rejects.toThrow("Connection refused");
    });
  });

  describe("getUserPreferencesByUserId", () => {
    it("should make GET request to /user-preferences/:userId", async () => {
      const mockResponse = {
        data: {
          id: 1,
          user_id: 1,
          date_format: UserDateFormat.DD_MM_YYYY_DASH,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUserPreferencesByUserId(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/user-preferences/1");
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "User preferences not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUserPreferencesByUserId(999)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getUserPreferencesByUserId(1)).rejects.toThrow("Connection refused");
    });
  });

  describe("createNewUserPreferences", () => {
    it("should make POST request to /user-preferences/ with data", async () => {
      const mockResponse = {
        data: {
          id: 1,
          user_id: 1,
          date_format: UserDateFormat.DD_MM_YYYY_DASH,
        },
        status: 201,
        statusText: "Created",
      };

      const data = {
        user_id: 1,
        date_format: UserDateFormat.DD_MM_YYYY_DASH,
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createNewUserPreferences(data);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/user-preferences/", data);
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid preferences data" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        createNewUserPreferences({ user_id: 1, date_format: UserDateFormat.DD_MM_YYYY_DASH }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        createNewUserPreferences({ user_id: 1, date_format: UserDateFormat.MM_DD_YYYY_DASH }),
      ).rejects.toThrow("Network timeout");
    });
  });

  describe("updateUserPreferencesById", () => {
    it("should make PATCH request to /user-preferences/:userId with data", async () => {
      const mockResponse = {
        data: {
          id: 1,
          user_id: 1,
          date_format: UserDateFormat.DD_MM_YY_SLASH,
        },
        status: 200,
        statusText: "OK",
      };

      const data = { date_format: UserDateFormat.DD_MM_YY_SLASH };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateUserPreferencesById({ userId: 1, data });

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/user-preferences/1", data);
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "User preferences not found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(
        updateUserPreferencesById({
          userId: 999,
          data: { date_format: UserDateFormat.DD_MM_YYYY_DASH },
        }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(
        updateUserPreferencesById({
          userId: 1,
          data: { date_format: UserDateFormat.MM_DD_YYYY_DASH },
        }),
      ).rejects.toThrow("Connection refused");
    });
  });
});
