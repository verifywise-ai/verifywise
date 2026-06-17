import { describe, it, expect, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../../controllers/user.ctrl", () => ({
  checkUserExists: jest.fn((_req: any, res: any) => res.status(200).json({ exists: true })),
  createNewUser: jest.fn((_req: any, res: any) => res.status(201).json({ id: 1 })),
  deleteUserById: jest.fn((_req: any, res: any) => res.status(204).send()),
  getAllUsers: jest.fn((_req: any, res: any) =>
    res.status(200).json([{ id: 1, email: "a@b.com" }]),
  ),
  getUserById: jest.fn((_req: any, res: any) => res.status(200).json({ id: 1, email: "a@b.com" })),
  loginUser: jest.fn((_req: any, res: any) => res.status(200).json({ token: "jwt" })),
  loginUserWithMicrosoft: jest.fn((_req: any, res: any) => res.status(200).json({ token: "jwt" })),
  updateUserById: jest.fn((_req: any, res: any) => res.status(200).json({ updated: true })),
  calculateProgress: jest.fn((_req: any, res: any) => res.status(200).json({ progress: 50 })),
  ChangePassword: jest.fn((_req: any, res: any) => res.status(200).json({ changed: true })),
  refreshAccessToken: jest.fn((_req: any, res: any) => res.status(200).json({ token: "new" })),
  uploadUserProfilePhoto: jest.fn((_req: any, res: any) =>
    res.status(200).json({ uploaded: true }),
  ),
  getUserProfilePhoto: jest.fn((_req: any, res: any) => res.status(200).json({ photo: "base64" })),
  deleteUserProfilePhoto: jest.fn((_req: any, res: any) => res.status(204).send()),
  resetPassword: jest.fn((_req: any, res: any) => res.status(200).json({ reset: true })),
}));

jest.mock("../../../middleware/auth.middleware", () =>
  jest.fn((_req: any, _res: any, next: any) => next()),
);

jest.mock("../../../middleware/register.middleware", () =>
  jest.fn((_req: any, _res: any, next: any) => next()),
);

jest.mock("../../../middleware/selfOnly.middleware", () => ({
  selfOnly: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock("../../../middleware/rateLimit.middleware", () => ({
  authLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
  tokenRefreshLimiter: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.mock("express-rate-limit", () =>
  jest.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
);

import userRoutes from "../../user.route";

function createUserTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use("/api/users", userRoutes);
  return app;
}

describe("GET /api/users", () => {
  it("should return 200 with user list", async () => {
    const app = createUserTestApp();
    const res = await request(app).get("/api/users");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/users/:id", () => {
  it("should return 200 with user data", async () => {
    const app = createUserTestApp();
    const res = await request(app).get("/api/users/1");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id");
  });
});

describe("POST /api/users/login", () => {
  it("should return 200 with token on valid credentials", async () => {
    const app = createUserTestApp();
    const res = await request(app)
      .post("/api/users/login")
      .send({ email: "a@b.com", password: "pass" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
  });
});

describe("POST /api/users/register", () => {
  it("should return 201 when registration is valid", async () => {
    const app = createUserTestApp();
    const res = await request(app)
      .post("/api/users/register")
      .send({ email: "new@b.com", password: "pass" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
  });
});

describe("PATCH /api/users/:id", () => {
  it("should return 200", async () => {
    const app = createUserTestApp();
    const res = await request(app).patch("/api/users/1").send({ name: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("updated");
  });
});

describe("DELETE /api/users/:id", () => {
  it("should return 204", async () => {
    const app = createUserTestApp();
    const res = await request(app).delete("/api/users/1");

    expect(res.status).toBe(204);
  });
});
