import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useRegisterUser from "../useRegisterUser";
import * as userRepository from "../../repository/user.repository";
import * as logEngine from "../../tools/log.engine";

vi.mock("../../repository/user.repository", () => ({
  createNewUser: vi.fn(),
}));

vi.mock("../../tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

const mockCreateNewUser = userRepository.createNewUser as unknown as ReturnType<typeof vi.fn>;
const mockLogEngine = logEngine.logEngine as unknown as ReturnType<typeof vi.fn>;

describe("useRegisterUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("registerUser", () => {
    it("should register user successfully", async () => {
      const mockResponse = {
        status: 201,
        data: { id: "1", email: "test@example.com" },
      };
      mockCreateNewUser.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useRegisterUser());

      let isSuccess: boolean | undefined;
      let response: any;

      await act(async () => {
        const res = await result.current.registerUser(
          {
            values: { email: "test@example.com", firstname: "John", lastname: "Doe" },
            user: { id: "1", firstname: "John", lastname: "Doe", roleId: 2 },
            setIsSubmitting: vi.fn(),
          },
          "test-token"
        );
        isSuccess = res.isSuccess;
        response = res.response;
      });

      expect(isSuccess).toBe(201);
      expect(response).toEqual(mockResponse);
      expect(mockCreateNewUser).toHaveBeenCalledWith(
        { userData: { email: "test@example.com", firstname: "John", lastname: "Doe", role_id: 2 } },
        { Authorization: "Bearer test-token" }
      );
    });

    it("should use default roleId when not provided", async () => {
      const mockResponse = {
        status: 201,
        data: { id: "1" },
      };
      mockCreateNewUser.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useRegisterUser());

      await act(async () => {
        await result.current.registerUser(
          {
            values: { email: "test@example.com" },
            user: { id: "1", firstname: "John", lastname: "Doe" },
            setIsSubmitting: vi.fn(),
          },
          null
        );
      });

      expect(mockCreateNewUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userData: expect.objectContaining({ role_id: 1 }),
        }),
        { Authorization: "Bearer " }
      );
    });

    it("should handle registration error", async () => {
      const error = new Error("Network error");
      error.status = 500;
      mockCreateNewUser.mockRejectedValue(error);

      const { result } = renderHook(() => useRegisterUser());

      let isSuccess: boolean | undefined;

      await act(async () => {
        const res = await result.current.registerUser(
          {
            values: { email: "test@example.com" },
            user: { id: "1", firstname: "John", lastname: "Doe", roleId: 1 },
            setIsSubmitting: vi.fn(),
          },
          null
        );
        isSuccess = res.isSuccess;
      });

      expect(isSuccess).toBe(500);
      expect(mockLogEngine).toHaveBeenCalledWith({
        type: "error",
        message: expect.stringContaining("Network error"),
      });
    });

    it("should handle unknown error", async () => {
      mockCreateNewUser.mockRejectedValue("Unknown error");

      const { result } = renderHook(() => useRegisterUser());

      await act(async () => {
        await result.current.registerUser(
          {
            values: { email: "test@example.com" },
            user: { id: "1", firstname: "John", lastname: "Doe", roleId: 1 },
            setIsSubmitting: vi.fn(),
          },
          null
        );
      });

      expect(mockLogEngine).toHaveBeenCalledWith({
        type: "error",
        message: expect.stringContaining("Unknown error"),
      });
    });
  });

  describe("handleApiResponse", () => {
    it("should call setIsSubmitting with false", async () => {
      const setIsSubmitting = vi.fn();

      const { result } = renderHook(() => useRegisterUser());

      const mockResponse = {
        status: 201,
        data: { id: "1" },
      };

      mockCreateNewUser.mockResolvedValue(mockResponse);

      await act(async () => {
        await result.current.registerUser(
          {
            values: {},
            user: { id: "1", firstname: "John", lastname: "Doe", roleId: 1 },
            setIsSubmitting,
          },
          null
        );
      });

      expect(setIsSubmitting).toHaveBeenCalledWith(false);
    });
  });
});
