import { describe, it, expect } from "@jest/globals";
import { parseOrigins, testOrigin } from "../parseOrigins.utils";

describe("parseOrigins.utils", () => {
  describe("parseOrigins", () => {
    it("should parse a JSON array string", () => {
      const result = parseOrigins('["url1", "url2"]');
      expect(result).toEqual(["url1", "url2"]);
    });

    it("should parse a comma-separated string into trimmed array", () => {
      const result = parseOrigins("url1, url2");
      expect(result).toEqual(["url1", "url2"]);
    });

    it("should parse a comma-separated string without spaces", () => {
      const result = parseOrigins("url1,url2,url3");
      expect(result).toEqual(["url1", "url2", "url3"]);
    });

    it("should return an array with a single origin for a plain string", () => {
      const result = parseOrigins("url1");
      expect(result).toEqual(["url1"]);
    });

    it("should return an empty array when input is undefined", () => {
      const result = parseOrigins(undefined);
      expect(result).toEqual([]);
    });

    it("should return an empty array when input is an empty string", () => {
      const result = parseOrigins("");
      expect(result).toEqual([]);
    });

    it("should trim whitespace around origins", () => {
      const result = parseOrigins("  url1  ,   url2   ");
      expect(result).toEqual(["url1", "url2"]);
    });
  });

  describe("testOrigin", () => {
    it("should allow origin when it is included in allowedOrigins", () => {
      const callback = jest.fn();
      testOrigin({
        origin: "https://example.com",
        allowedOrigins: {
          includes: (o: string) => o === "https://example.com",
        },
        callback,
      });
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it("should allow origin when origin is undefined", () => {
      const callback = jest.fn();
      testOrigin({
        origin: undefined,
        allowedOrigins: {
          includes: () => false,
        },
        callback,
      });
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it("should call callback with Error when origin is not allowed", () => {
      const callback = jest.fn();
      testOrigin({
        origin: "https://evil.com",
        allowedOrigins: {
          includes: () => false,
        },
        callback,
      });
      expect(callback).toHaveBeenCalledTimes(1);
      const errorArg = callback.mock.calls[0][0];
      expect(errorArg).toBeInstanceOf(Error);
      expect(errorArg.message).toBe("Not allowed by CORS");
    });
  });
});
