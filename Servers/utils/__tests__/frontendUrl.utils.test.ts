import { describe, it, expect, afterEach } from "@jest/globals";
import { frontendBaseUrl } from "../frontendUrl.utils";

describe("frontendBaseUrl", () => {
  const saved = process.env.FRONTEND_URL;

  afterEach(() => {
    if (saved === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = saved;
  });

  it("uses FRONTEND_URL when it is set", () => {
    process.env.FRONTEND_URL = "https://vw.example.com";
    expect(frontendBaseUrl()).toBe("https://vw.example.com");
  });

  it("falls back to the local frontend when FRONTEND_URL is not set", () => {
    delete process.env.FRONTEND_URL;
    expect(frontendBaseUrl()).toBe("http://localhost:5173");
  });

  it("falls back to the local frontend when FRONTEND_URL is empty", () => {
    process.env.FRONTEND_URL = "";
    expect(frontendBaseUrl()).toBe("http://localhost:5173");
  });

  it("drops trailing slashes", () => {
    process.env.FRONTEND_URL = "https://vw.example.com//";
    expect(frontendBaseUrl()).toBe("https://vw.example.com");
  });

  it("reads FRONTEND_URL at call time", () => {
    process.env.FRONTEND_URL = "https://first.example.com";
    expect(frontendBaseUrl()).toBe("https://first.example.com");
    process.env.FRONTEND_URL = "https://second.example.com";
    expect(frontendBaseUrl()).toBe("https://second.example.com");
  });
});
