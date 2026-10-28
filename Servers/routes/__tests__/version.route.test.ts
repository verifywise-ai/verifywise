/**
 * Contract test for the version router (version.route.ts).
 *
 * GET / is intentionally public and returns the backend version read from the
 * shared root version.json at import time. From ts-jest's __dirname the file
 * may not resolve, in which case the route reports "unknown" — so we assert
 * the shape (a string), not a specific value.
 */
import { describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";

import versionRouter from "../version.route";

const app = () => {
  const a = express();
  a.use("/api/version", versionRouter);
  return a;
};

describe("GET /api/version", () => {
  it("returns 200 with a string version to an unauthenticated caller", async () => {
    const res = await request(app()).get("/api/version");

    expect(res.status).toBe(200);
    expect(typeof res.body.version).toBe("string");
    expect(res.body.version.length).toBeGreaterThan(0);
  });
});
