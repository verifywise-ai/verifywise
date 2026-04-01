import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import { createPolicyLinkedObjects } from "../policyLinkedObjects.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    post: vi.fn(),
  },
}));

const mockLinkedObject = {
  id: 1,
  policyId: 5,
  linkedEntityType: "vendor",
  linkedEntityId: 10,
  relationship: "compliant_with",
  createdAt: "2026-03-12T00:00:00Z",
  updatedAt: "2026-03-12T00:00:00Z",
};

const mockLinkedObjects = [
  mockLinkedObject,
  {
    id: 2,
    policyId: 5,
    linkedEntityType: "framework",
    linkedEntityId: 2,
    relationship: "supports",
    createdAt: "2026-03-11T00:00:00Z",
    updatedAt: "2026-03-11T00:00:00Z",
  },
];

describe("policyLinkedObjects.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createPolicyLinkedObjects", () => {
    it("should create policy linked object successfully", async () => {
      const response = { data: mockLinkedObject };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createPolicyLinkedObjects(
        "/policies/5/linked-objects",
        {
          linkedEntityType: "vendor",
          linkedEntityId: 10,
          relationship: "compliant_with",
        },
      );

      expect(apiServices.post).toHaveBeenCalledWith(
        "/policies/5/linked-objects",
        {
          linkedEntityType: "vendor",
          linkedEntityId: 10,
          relationship: "compliant_with",
        },
      );
      expect(result).toEqual(mockLinkedObject);
    });

    it("should return response.data directly", async () => {
      const responseData = { id: 1, message: "Created" };
      const response = { data: responseData };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createPolicyLinkedObjects(
        "/policies/1/linked-objects",
        {
          type: "vendor",
        },
      );

      expect(result).toEqual(responseData);
    });

    it("should handle different route URLs", async () => {
      const response = { data: mockLinkedObject };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      await createPolicyLinkedObjects("/policies/15/linked-objects", {
        linkedEntityType: "vendor",
        linkedEntityId: 20,
      });

      expect(apiServices.post).toHaveBeenCalledWith(
        "/policies/15/linked-objects",
        expect.any(Object),
      );
    });

    it("should pass data object to API correctly", async () => {
      const response = { data: mockLinkedObject };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const inputData = {
        linkedEntityType: "framework",
        linkedEntityId: 3,
        relationship: "supports",
      };

      await createPolicyLinkedObjects("/policies/5/linked-objects", inputData);

      expect(apiServices.post).toHaveBeenCalledWith(
        "/policies/5/linked-objects",
        inputData,
      );
    });

    it("should handle nested data structures", async () => {
      const nestedData = {
        linkedEntityType: "vendor",
        linkedEntityId: 10,
        relationship: "compliant_with",
        metadata: {
          verified: true,
          verificationDate: "2026-03-12",
        },
      };
      const response = { data: { ...mockLinkedObject, ...nestedData } };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createPolicyLinkedObjects(
        "/policies/5/linked-objects",
        nestedData,
      );

      expect(apiServices.post).toHaveBeenCalledWith(
        "/policies/5/linked-objects",
        nestedData,
      );
      expect(result).toEqual(expect.objectContaining(nestedData));
    });

    it("should handle array data in response", async () => {
      const response = { data: mockLinkedObjects };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createPolicyLinkedObjects(
        "/policies/5/linked-objects/batch",
        {
          linkedObjects: mockLinkedObjects,
        },
      );

      expect(result).toEqual(mockLinkedObjects);
      expect(Array.isArray(result)).toBe(true);
    });

    it("should handle API errors and re-throw them", async () => {
      const error = new Error("Network error");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createPolicyLinkedObjects("/policies/5/linked-objects", {}),
      ).rejects.toThrow("Network error");
    });

    it("should handle 400 bad request error", async () => {
      const error = {
        response: { status: 400, data: { message: "Bad request" } },
        message: "Bad Request",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createPolicyLinkedObjects("/policies/5/linked-objects", {}),
      ).rejects.toEqual(error);
    });

    it("should handle 404 not found error", async () => {
      const error = {
        response: { status: 404, data: { message: "Policy not found" } },
        message: "Not Found",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createPolicyLinkedObjects("/policies/999/linked-objects", {}),
      ).rejects.toEqual(error);
    });

    it("should handle 409 conflict error", async () => {
      const error = {
        response: {
          status: 409,
          data: { message: "Linked object already exists" },
        },
        message: "Conflict",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createPolicyLinkedObjects("/policies/5/linked-objects", {
          linkedEntityType: "vendor",
          linkedEntityId: 10,
        }),
      ).rejects.toEqual(error);
    });

    it("should handle 422 validation error", async () => {
      const error = {
        response: { status: 422, data: { message: "Validation failed" } },
        message: "Unprocessable Entity",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createPolicyLinkedObjects("/policies/5/linked-objects", {
          invalidField: "value",
        }),
      ).rejects.toEqual(error);
    });

    it("should handle 403 forbidden error", async () => {
      const error = {
        response: { status: 403, data: { message: "Forbidden" } },
        message: "Forbidden",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createPolicyLinkedObjects("/policies/5/linked-objects", {}),
      ).rejects.toEqual(error);
    });

    it("should handle 500 server error", async () => {
      const error = {
        response: { status: 500, data: { message: "Internal Server Error" } },
        message: "Internal Server Error",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createPolicyLinkedObjects("/policies/5/linked-objects", {}),
      ).rejects.toEqual(error);
    });

    it("should handle 503 service unavailable error", async () => {
      const error = {
        response: { status: 503, data: { message: "Service Unavailable" } },
        message: "Service Unavailable",
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(
        createPolicyLinkedObjects("/policies/5/linked-objects", {}),
      ).rejects.toEqual(error);
    });

    it("should log errors to console", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Test error");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      try {
        await createPolicyLinkedObjects("/policies/5/linked-objects", {});
      } catch {
        // expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error creating policy linked objects:",
        error,
      );
      consoleErrorSpy.mockRestore();
    });

    it("should handle empty data object", async () => {
      const response = { data: { id: 1 } };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createPolicyLinkedObjects(
        "/policies/5/linked-objects",
        {},
      );

      expect(apiServices.post).toHaveBeenCalledWith(
        "/policies/5/linked-objects",
        {},
      );
      expect(result).toEqual({ id: 1 });
    });

    it("should handle complex data structures with multiple relationships", async () => {
      const complexData = {
        linkedObjects: [
          {
            linkedEntityType: "vendor",
            linkedEntityId: 1,
            relationship: "compliant_with",
          },
          {
            linkedEntityType: "framework",
            linkedEntityId: 2,
            relationship: "supports",
          },
        ],
      };
      const response = { data: complexData };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createPolicyLinkedObjects(
        "/policies/5/linked-objects/batch",
        complexData,
      );

      expect(apiServices.post).toHaveBeenCalledWith(
        "/policies/5/linked-objects/batch",
        complexData,
      );
      expect(result).toEqual(complexData);
    });

    it("should preserve error stack trace on re-throw", async () => {
      const error = new Error("Original error message");
      vi.mocked(apiServices.post).mockRejectedValue(error);

      try {
        await createPolicyLinkedObjects("/policies/5/linked-objects", {});
        expect.fail("Should have thrown an error");
      } catch (caught) {
        expect(caught).toEqual(error);
        expect((caught as Error).message).toBe("Original error message");
      }
    });

    it("should handle response with additional metadata", async () => {
      const responseData = {
        id: 1,
        policyId: 5,
        linkedEntityType: "vendor",
        linkedEntityId: 10,
        metadata: {
          createdBy: "user123",
          createdAt: "2026-03-12T00:00:00Z",
        },
      };
      const response = { data: responseData };
      vi.mocked(apiServices.post).mockResolvedValue(response as any);

      const result = await createPolicyLinkedObjects(
        "/policies/5/linked-objects",
        {
          linkedEntityType: "vendor",
          linkedEntityId: 10,
        },
      );

      expect(result).toEqual(responseData);
      expect(result.metadata).toBeDefined();
    });
  });
});
