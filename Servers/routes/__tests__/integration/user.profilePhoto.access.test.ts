import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

/**
 * BOLA regression tests for profile-photo routes (issue #4723).
 *
 * Uses the REAL selfOnly middleware — the sibling suite
 * (user.route.test.ts) mocks it, so it cannot catch a missing gate.
 * authenticateJWT is stubbed to set req.userId from the Authorization
 * header so we can simulate acting as a different user.
 */

const mockUploadUserProfilePhoto = jest.fn((_req: any, res: any) =>
  res.status(200).json({ uploaded: true }),
);
const mockGetUserProfilePhoto = jest.fn((_req: any, res: any) =>
  res.status(200).json({ photo: "base64" }),
);
const mockDeleteUserProfilePhoto = jest.fn((_req: any, res: any) => res.status(204).send());

jest.mock("../../../controllers/user.ctrl", () => ({
  checkUserExists: jest.fn((_req: any, res: any) => res.status(200).json({ exists: true })),
  createNewUser: jest.fn((_req: any, res: any) => res.status(201).json({ id: 1 })),
  deleteUserById: jest.fn((_req: any, res: any) => res.status(204).send()),
  getAllUsers: jest.fn((_req: any, res: any) => res.status(200).json([])),
  getUserById: jest.fn((_req: any, res: any) => res.status(200).json({ id: 1 })),
  loginUser: jest.fn((_req: any, res: any) => res.status(200).json({ token: "jwt" })),
  loginUserWithMicrosoft: jest.fn((_req: any, res: any) => res.status(200).json({ token: "jwt" })),
  updateUserById: jest.fn((_req: any, res: any) => res.status(200).json({ updated: true })),
  calculateProgress: jest.fn((_req: any, res: any) => res.status(200).json({ progress: 50 })),
  ChangePassword: jest.fn((_req: any, res: any) => res.status(200).json({ changed: true })),
  refreshAccessToken: jest.fn((_req: any, res: any) => res.status(200).json({ token: "new" })),
  uploadUserProfilePhoto: (req: any, res: any) => mockUploadUserProfilePhoto(req, res),
  getUserProfilePhoto: (req: any, res: any) => mockGetUserProfilePhoto(req, res),
  deleteUserProfilePhoto: (req: any, res: any) => mockDeleteUserProfilePhoto(req, res),
  resetPassword: jest.fn((_req: any, res: any) => res.status(200).json({ reset: true })),
  logoutUser: jest.fn((_req: any, res: any) => res.status(200).json({ message: "ok" })),
  getPreferencesForCurrentUser: jest.fn((_req: any, res: any) =>
    res.status(200).json({ date_format: "DD-MM-YYYY", language: "en" }),
  ),
  patchPreferencesForCurrentUser: jest.fn((_req: any, res: any) =>
    res.status(200).json({ date_format: "MM-DD-YYYY", language: "de" }),
  ),
}));

// Stub auth to set req.userId from a test header (simulates JWT identity)
jest.mock("../../../middleware/auth.middleware", () =>
  jest.fn((req: any, _res: any, next: any) => {
    const id = req.headers["x-test-user-id"];
    if (id) req.userId = Number(id);
    next();
  }),
);

jest.mock("../../../middleware/register.middleware", () =>
  jest.fn((_req: any, _res: any, next: any) => next()),
);

jest.mock("../../../middleware/accessControl.middleware", () => ({
  __esModule: true,
  default: jest.fn(() => (_req: any, _res: any, next: any) => next()),
}));

jest.mock("../../../middleware/rateLimit.middleware", () => ({
  authLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
  loginLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
  tokenRefreshLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
}));

// NOTE: selfOnly.middleware is intentionally NOT mocked — these tests
// verify the real gate is mounted on the photo routes.

import userRoutes from "../../user.route";

function createApp(): express.Application {
  const app = express();
  app.use(express.json());
  // i18n stub required by STATUS_CODE responses
  app.use((req: any, _res, next) => {
    req.t = (s: string) => s;
    next();
  });
  app.use("/api/users", userRoutes);
  return app;
}

const asUser = (id: number) => ({ "x-test-user-id": String(id) });

describe("profile-photo BOLA gate (issue #4723)", () => {
  beforeEach(() => {
    mockUploadUserProfilePhoto.mockClear();
    mockGetUserProfilePhoto.mockClear();
    mockDeleteUserProfilePhoto.mockClear();
  });

  describe("POST /api/users/:id/profile-photo", () => {
    it("allows a user to upload their own photo", async () => {
      const res = await request(createApp()).post("/api/users/2/profile-photo").set(asUser(2));
      expect(res.status).toBe(200);
      expect(mockUploadUserProfilePhoto).toHaveBeenCalled();
    });

    it("blocks uploading another user's photo (403, controller not reached)", async () => {
      const res = await request(createApp()).post("/api/users/1/profile-photo").set(asUser(2));
      expect(res.status).toBe(403);
      expect(mockUploadUserProfilePhoto).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/users/:id/profile-photo", () => {
    it("allows a user to delete their own photo", async () => {
      const res = await request(createApp()).delete("/api/users/2/profile-photo").set(asUser(2));
      expect(res.status).toBe(204);
      expect(mockDeleteUserProfilePhoto).toHaveBeenCalled();
    });

    it("blocks deleting another user's photo (403, controller not reached)", async () => {
      const res = await request(createApp()).delete("/api/users/1/profile-photo").set(asUser(2));
      expect(res.status).toBe(403);
      expect(mockDeleteUserProfilePhoto).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/users/:id/profile-photo", () => {
    it("stays org-scoped: any member can fetch another member's photo", async () => {
      const res = await request(createApp()).get("/api/users/1/profile-photo").set(asUser(2));
      expect(res.status).toBe(200);
      expect(mockGetUserProfilePhoto).toHaveBeenCalled();
    });
  });
});
