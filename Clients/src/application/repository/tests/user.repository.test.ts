import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  getUserById,
  getAllUsers,
  createNewUser,
  updateUserById,
  updatePassword,
  deleteUserById,
  checkUserExists,
  loginUser,
  uploadUserProfilePhoto,
  getUserProfilePhoto,
  deleteUserProfilePhoto,
} from "../user.repository";

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

describe("user.repository", () => {
  beforeEach(vi.clearAllMocks);
  afterEach(vi.clearAllMocks);

  describe("getUserById", () => {
    it("should make GET request to /users/:userId", async () => {
      const mockResponse = {
        data: {
          id: 1,
          name: "John",
          surname: "Doe",
          email: "john@example.com",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUserById({ userId: 1 });

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/users/1");
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "User not found" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUserById({ userId: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getUserById({ userId: 1 })).rejects.toThrow("Network timeout");
    });
  });

  describe("getAllUsers", () => {
    it("should make GET request to /users", async () => {
      const mockResponse = {
        data: {
          users: [
            { id: 1, name: "John", surname: "Doe" },
            { id: 2, name: "Jane", surname: "Smith" },
          ],
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllUsers();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/users");
      expect(result).toEqual(mockResponse.data);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllUsers()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getAllUsers()).rejects.toThrow("Connection refused");
    });
  });

  describe("createNewUser", () => {
    it("should make POST request to /users/register with user data", async () => {
      const mockResponse = {
        data: {
          id: 1,
          name: "John",
          surname: "Doe",
          email: "john@example.com",
        },
        status: 201,
        statusText: "Created",
      };

      const userData = {
        name: "John",
        surname: "Doe",
        email: "john@example.com",
        password: "password123",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createNewUser({ userData });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/users/register", userData, { headers: undefined });
      expect(result).toEqual(mockResponse);
    });

    it("should pass headers when provided", async () => {
      const mockResponse = {
        data: {
          id: 1,
          name: "John",
          surname: "Doe",
          email: "john@example.com",
        },
        status: 201,
        statusText: "Created",
      };

      const userData = {
        name: "John",
        surname: "Doe",
        email: "john@example.com",
        password: "password123",
      };

      const headers = { "Authorization": "Bearer token" };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createNewUser({ userData }, headers);

      expect(apiServices.post).toHaveBeenCalledWith("/users/register", userData, { headers });
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Email already exists" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        createNewUser({
          userData: {
            name: "John",
            surname: "Doe",
            email: "john@example.com",
            password: "password123",
          },
        }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        createNewUser({
          userData: {
            name: "John",
            surname: "Doe",
            email: "john@example.com",
            password: "password123",
          },
        }),
      ).rejects.toThrow("Network timeout");
    });
  });

  describe("updateUserById", () => {
    it("should make PATCH request to /users/:userId with user data", async () => {
      const mockResponse = {
        data: {
          id: 1,
          name: "John",
          surname: "Doe",
          email: "john@example.com",
        },
        status: 200,
        statusText: "OK",
      };

      const userData = {
        name: "John Updated",
        surname: "Doe",
        email: "john@example.com",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateUserById({ userId: 1, userData });

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/users/1", userData);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "User not found" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(
        updateUserById({
          userId: 999,
          userData: { name: "Test" },
        }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(
        updateUserById({
          userId: 1,
          userData: { name: "Test" },
        }),
      ).rejects.toThrow("Connection refused");
    });
  });

  describe("updatePassword", () => {
    it("should make PATCH request to /users/chng-pass/:userId with passwords", async () => {
      const mockResponse = {
        data: {
          message: "Password updated successfully",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updatePassword({
        userId: 1,
        currentPassword: "oldPassword",
        newPassword: "newPassword",
      });

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith("/users/chng-pass/1", {
        id: 1,
        currentPassword: "oldPassword",
        newPassword: "newPassword",
      });
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Current password is incorrect" },
        },
      };

      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(
        updatePassword({
          userId: 1,
          currentPassword: "wrongPassword",
          newPassword: "newPassword",
        }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.patch).mockRejectedValue(networkError);

      await expect(
        updatePassword({
          userId: 1,
          currentPassword: "oldPassword",
          newPassword: "newPassword",
        }),
      ).rejects.toThrow("Network timeout");
    });
  });

  describe("deleteUserById", () => {
    it("should make DELETE request to /users/:userId", async () => {
      const mockResponse = {
        data: {
          message: "User deleted successfully",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteUserById({ userId: 1 });

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/users/1");
      expect(result).toEqual(mockResponse);
    });

    it("should return special response for 403 (demo user deletion)", async () => {
      const mockError = {
        status: 403,
        data: { data: "Demo user cannot be deleted" },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      const result = await deleteUserById({ userId: 1 });

      expect(result).toEqual({
        data: { message: "Demo user cannot be deleted" },
        status: 403,
      });
    });

    it("should return default message for 403 when data.data is undefined", async () => {
      const mockError = {
        status: 403,
        data: {},
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      const result = await deleteUserById({ userId: 1 });

      expect(result).toEqual({
        data: { message: "User cannot be deleted" },
        status: 403,
      });
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteUserById({ userId: 999 })).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteUserById({ userId: 1 })).rejects.toThrow("Connection refused");
    });
  });

  describe("checkUserExists", () => {
    it("should make GET request to /users/check/exists", async () => {
      const mockResponse = {
        data: { exists: true },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await checkUserExists();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/users/check/exists");
      expect(result).toEqual({ exists: true });
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(checkUserExists()).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(checkUserExists()).rejects.toThrow("Network timeout");
    });
  });

  describe("loginUser", () => {
    it("should make POST request to /users/login with credentials", async () => {
      const mockResponse = {
        data: {
          data: {
            token: "jwt-token-here",
            onboarding_status: "completed",
          },
        },
        status: 200,
        statusText: "OK",
      };

      const credentials = {
        email: "john@example.com",
        password: "password123",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await loginUser({ body: credentials });

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith("/users/login", credentials);
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 401,
          data: { message: "Invalid credentials" },
        },
      };

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        loginUser({
          body: {
            email: "john@example.com",
            password: "wrongpassword",
          },
        }),
      ).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(
        loginUser({
          body: {
            email: "john@example.com",
            password: "password123",
          },
        }),
      ).rejects.toThrow("Connection refused");
    });
  });

  describe("uploadUserProfilePhoto", () => {
    it("should make POST request to /users/:userId/profile-photo with FormData", async () => {
      const mockResponse = {
        data: {
          photoUrl: "https://example.com/photo.jpg",
          message: "Photo uploaded successfully",
        },
        status: 200,
        statusText: "OK",
      };

      const mockFile = new File(["test"], "photo.jpg", { type: "image/jpeg" });

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await uploadUserProfilePhoto(1, mockFile);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        "/users/1/profile-photo",
        expect.any(FormData),
        expect.objectContaining({
          headers: {
            "Content-Type": "multipart/form-data",
          },
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: "Invalid file type" },
        },
      };

      const mockFile = new File(["test"], "photo.txt", { type: "text/plain" });

      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(uploadUserProfilePhoto(1, mockFile)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");
      const mockFile = new File(["test"], "photo.jpg", { type: "image/jpeg" });

      vi.mocked(apiServices.post).mockRejectedValue(networkError);

      await expect(uploadUserProfilePhoto(1, mockFile)).rejects.toThrow("Network timeout");
    });
  });

  describe("getUserProfilePhoto", () => {
    it("should make GET request to /users/:userId/profile-photo", async () => {
      const mockResponse = {
        data: {
          photoUrl: "https://example.com/photo.jpg",
          photo: null,
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getUserProfilePhoto(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith("/users/1/profile-photo", {
        responseType: "json",
      });
      expect(result).toEqual(mockResponse.data);
    });

    it("should return null photo for 404 (no profile photo)", async () => {
      const mockError = {
        status: 404,
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      const result = await getUserProfilePhoto(1);

      expect(result).toEqual({ photo: null });
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 500,
          data: { message: "Server error" },
        },
      };

      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getUserProfilePhoto(1)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Connection refused");

      vi.mocked(apiServices.get).mockRejectedValue(networkError);

      await expect(getUserProfilePhoto(1)).rejects.toThrow("Connection refused");
    });
  });

  describe("deleteUserProfilePhoto", () => {
    it("should make DELETE request to /users/:userId/profile-photo", async () => {
      const mockResponse = {
        data: {
          message: "Photo deleted successfully",
        },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteUserProfilePhoto(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith("/users/1/profile-photo");
      expect(result).toEqual(mockResponse);
    });

    it("should throw error with status and data if API call fails", async () => {
      const mockError = {
        response: {
          status: 404,
          data: { message: "Photo not found" },
        },
      };

      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteUserProfilePhoto(1)).rejects.toThrow();
    });

    it("should throw error without response property for network errors", async () => {
      const networkError = new Error("Network timeout");

      vi.mocked(apiServices.delete).mockRejectedValue(networkError);

      await expect(deleteUserProfilePhoto(1)).rejects.toThrow("Network timeout");
    });
  });
});
