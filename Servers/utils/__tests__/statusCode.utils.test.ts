import { describe, it, expect } from "@jest/globals";
import { STATUS_CODE } from "../statusCode.utils";

describe("statusCode.utils", () => {
  const callStatus = (code: number, data: any) => (STATUS_CODE as any)[code](data);

  describe("1xx informational responses", () => {
    it.each([
      [100, "Continue"],
      [101, "Switching Protocols"],
      [102, "Processing"],
      [103, "Early Hints"],
    ])("should return message and data for status %i", (code, message) => {
      const data = { info: "test" };
      const result = callStatus(code, data);
      expect(result).toEqual({ message, data });
    });
  });

  describe("2xx success", () => {
    it.each([
      [200, "OK"],
      [201, "Created"],
      [202, "Accepted"],
      [203, "Non-Authoritative Information"],
      [204, "No Content"],
    ])("should return message and data for status %i", (code, message) => {
      const data = { id: 1 };
      const result = callStatus(code, data);
      expect(result).toEqual({ message, data });
    });

    it("should return null data when null is passed", () => {
      const result = callStatus(200, null);
      expect(result).toEqual({ message: "OK", data: null });
    });

    it("should return undefined data when undefined is passed", () => {
      const result = callStatus(200, undefined);
      expect(result).toEqual({ message: "OK", data: undefined });
    });
  });

  describe("3xx redirection", () => {
    it.each([
      [300, "Multiple Choices"],
      [301, "Moved Permanently"],
      [302, "Found"],
    ])("should return message and data for status %i", (code, message) => {
      const data = { url: "https://example.com" };
      const result = callStatus(code, data);
      expect(result).toEqual({ message, data });
    });
  });

  describe("4xx client errors", () => {
    it.each([
      [400, "Bad Request"],
      [401, "Unauthorized"],
      [402, "Payment Required"],
      [403, "Forbidden"],
      [404, "Not Found"],
      [405, "Method Not Allowed"],
      [406, "Not Acceptable"],
      [407, "Proxy Authentication Required"],
      [408, "Request Timeout"],
      [409, "Conflict"],
      [413, "Payload Too Large"],
      [415, "Unsupported Media Type"],
      [422, "Unprocessable Entity"],
      [429, "Too Many Requests"],
    ])("should return message and data for status %i", (code, message) => {
      const data = { error: "client error" };
      const result = callStatus(code, data);
      expect(result).toEqual({ message, data });
    });

    it("should return null data when null is passed to a 4xx status", () => {
      const result = callStatus(400, null);
      expect(result).toEqual({ message: "Bad Request", data: null });
    });

    it("should return undefined data when undefined is passed to a 4xx status", () => {
      const result = callStatus(404, undefined);
      expect(result).toEqual({ message: "Not Found", data: undefined });
    });
  });

  describe("5xx server errors", () => {
    it.each([
      [500, "Internal Server Error"],
      [501, "Not Implemented"],
      [502, "Bad Gateway"],
      [503, "Service Unavailable"],
      [504, "Gateway Timeout"],
    ])("should return message and error for status %i", (code, message) => {
      const error = new Error("server error");
      const result = callStatus(code, error);
      expect(result).toEqual({ message, error });
    });

    it("should return null error when null is passed to a 5xx status", () => {
      const result = callStatus(500, null);
      expect(result).toEqual({ message: "Internal Server Error", error: null });
    });

    it("should return undefined error when undefined is passed to a 5xx status", () => {
      const result = callStatus(503, undefined);
      expect(result).toEqual({ message: "Service Unavailable", error: undefined });
    });
  });
});
