import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  IntakeEntityType,
  IntakeFormStatus,
  IntakeSubmissionStatus,
  approveSubmission,
  archiveIntakeForm,
  createIntakeForm,
  deleteIntakeForm,
  getAllIntakeForms,
  getCaptcha,
  getEntityIntakeSubmission,
  getIntakeForm,
  getLLMFieldGuidance,
  getLLMSuggestedQuestions,
  getPendingSubmissions,
  getPublicForm,
  getPublicFormById,
  getSubmissionPreview,
  rejectSubmission,
  submitPublicForm,
  submitPublicFormById,
  updateIntakeForm,
  type IntakeForm,
  type IntakeSubmission,
} from "../intakeForm.repository";

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

const BASE_URL = "/intake";

// ─── Shared fixtures ────────────────────────────────────────────────────────

const mockForm: IntakeForm = {
  id: 1,
  name: "Test Form",
  description: "A test intake form",
  slug: "test-form",
  entityType: IntakeEntityType.MODEL,
  schema: { version: "1.0", fields: [] },
  submitButtonText: "Submit",
  status: IntakeFormStatus.ACTIVE,
  createdBy: 1,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const mockSubmission: IntakeSubmission = {
  id: 10,
  formId: 1,
  formData: { name: "Test" },
  submitterEmail: "user@example.com",
  status: IntakeSubmissionStatus.PENDING,
  resubmissionCount: 0,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ─── getAllIntakeForms ───────────────────────────────────────────────────────

describe("Test Intake Form Repository", () => {
  describe("getAllIntakeForms", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request without query params when none are provided", async () => {
      const mockResponse = {
        data: { data: [mockForm] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getAllIntakeForms();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(`${BASE_URL}/forms`, {
        signal: undefined,
      });
    });

    it("should append query params when provided", async () => {
      const mockResponse = {
        data: { data: [mockForm] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getAllIntakeForms({
        page: 2,
        limit: 10,
        status: IntakeFormStatus.ACTIVE,
        entityType: IntakeEntityType.MODEL,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/forms?page=2&limit=10&status=active&entityType=model`,
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: [mockForm] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getAllIntakeForms();

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: [mockForm] },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getAllIntakeForms({}, controller.signal);

      expect(apiServices.get).toHaveBeenCalledWith(`${BASE_URL}/forms`, {
        signal: controller.signal,
      });
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getAllIntakeForms()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getAllIntakeForms()).rejects.toThrow("Network timeout");
    });
  });

  // ─── getIntakeForm ─────────────────────────────────────────────────────────

  describe("getIntakeForm", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the correct URL with the form ID", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getIntakeForm(1);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(`${BASE_URL}/forms/1`, {
        signal: undefined,
      });
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getIntakeForm(1);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getIntakeForm(1, controller.signal);

      expect(apiServices.get).toHaveBeenCalledWith(`${BASE_URL}/forms/1`, {
        signal: controller.signal,
      });
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getIntakeForm(99)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(getIntakeForm(1)).rejects.toThrow("Connection refused");
    });
  });

  // ─── createIntakeForm ──────────────────────────────────────────────────────

  describe("createIntakeForm", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const createData = {
      name: "New Form",
      description: "Form description",
      entityType: IntakeEntityType.USE_CASE,
    };

    it("should make a POST request to the correct URL with the provided data", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createIntakeForm(createData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/forms`,
        createData,
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await createIntakeForm(createData);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 201,
        statusText: "Created",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await createIntakeForm(createData, controller.signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/forms`,
        createData,
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Validation error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(createIntakeForm(createData)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(createIntakeForm(createData)).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  // ─── updateIntakeForm ──────────────────────────────────────────────────────

  describe("updateIntakeForm", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const updateData = {
      name: "Updated Form",
      status: IntakeFormStatus.ARCHIVED,
    };

    it("should make a PATCH request to the correct URL with the provided data", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      await updateIntakeForm(1, updateData);

      expect(apiServices.patch).toHaveBeenCalledTimes(1);
      expect(apiServices.patch).toHaveBeenCalledWith(
        `${BASE_URL}/forms/1`,
        updateData,
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const result = await updateIntakeForm(1, updateData);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      await updateIntakeForm(1, updateData, controller.signal);

      expect(apiServices.patch).toHaveBeenCalledWith(
        `${BASE_URL}/forms/1`,
        updateData,
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.patch).mockRejectedValue(mockError);

      await expect(updateIntakeForm(99, updateData)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.patch).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(updateIntakeForm(1, updateData)).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  // ─── deleteIntakeForm ──────────────────────────────────────────────────────

  describe("deleteIntakeForm", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a DELETE request to the correct URL", async () => {
      const mockResponse = {
        data: { data: null },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteIntakeForm(1);

      expect(apiServices.delete).toHaveBeenCalledTimes(1);
      expect(apiServices.delete).toHaveBeenCalledWith(`${BASE_URL}/forms/1`, {
        signal: undefined,
      });
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: null },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const result = await deleteIntakeForm(1);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: null },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      await deleteIntakeForm(1, controller.signal);

      expect(apiServices.delete).toHaveBeenCalledWith(`${BASE_URL}/forms/1`, {
        signal: controller.signal,
      });
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.delete).mockRejectedValue(mockError);

      await expect(deleteIntakeForm(99)).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.delete).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(deleteIntakeForm(1)).rejects.toThrow("Connection refused");
    });
  });

  // ─── archiveIntakeForm ─────────────────────────────────────────────────────

  describe("archiveIntakeForm", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request to the archive endpoint", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await archiveIntakeForm(1);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/forms/1/archive`,
        undefined,
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await archiveIntakeForm(1);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockForm },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await archiveIntakeForm(1, controller.signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/forms/1/archive`,
        undefined,
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(archiveIntakeForm(99)).rejects.toEqual(mockError);
    });
  });

  // ─── getPendingSubmissions ─────────────────────────────────────────────────

  describe("getPendingSubmissions", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request without query params when none are provided", async () => {
      const mockResponse = {
        data: { data: [mockSubmission] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getPendingSubmissions();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(`${BASE_URL}/submissions`, {
        signal: undefined,
      });
    });

    it("should append query params when provided", async () => {
      const mockResponse = {
        data: { data: [mockSubmission] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getPendingSubmissions({
        page: 1,
        limit: 20,
        formId: 5,
        status: "pending",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/submissions?page=1&limit=20&formId=5&status=pending`,
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: [mockSubmission] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getPendingSubmissions();

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: [mockSubmission] },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getPendingSubmissions({}, controller.signal);

      expect(apiServices.get).toHaveBeenCalledWith(`${BASE_URL}/submissions`, {
        signal: controller.signal,
      });
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getPendingSubmissions()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getPendingSubmissions()).rejects.toThrow("Network timeout");
    });
  });

  // ─── getSubmissionPreview ──────────────────────────────────────────────────

  describe("getSubmissionPreview", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockPreview = {
      submission: mockSubmission,
      riskAssessment: null,
      entityPreview: {},
      form: {
        id: 1,
        name: "Test Form",
        entityType: "model",
        schema: { version: "1.0", fields: [] },
      },
    };

    it("should make a GET request to the correct preview URL", async () => {
      const mockResponse = {
        data: { data: mockPreview },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getSubmissionPreview(10);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/10/preview`,
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockPreview },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getSubmissionPreview(10);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockPreview },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getSubmissionPreview(10, controller.signal);

      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/10/preview`,
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getSubmissionPreview(99)).rejects.toEqual(mockError);
    });
  });

  // ─── approveSubmission ─────────────────────────────────────────────────────

  describe("approveSubmission", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request with an empty object when no data is provided", async () => {
      const mockResponse = {
        data: { data: { submission: mockSubmission, createdEntity: {} } },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await approveSubmission(10);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/10/approve`,
        {},
        { signal: undefined },
      );
    });

    it("should make a POST request with the provided data", async () => {
      const mockResponse = {
        data: { data: { submission: mockSubmission, createdEntity: {} } },
        status: 200,
        statusText: "OK",
      };
      const approveData = {
        confirmedEntityData: { name: "Approved Entity" },
        riskOverride: { tier: "high", justification: "Manual override" },
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await approveSubmission(10, approveData);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/10/approve`,
        approveData,
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: { submission: mockSubmission, createdEntity: {} } },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await approveSubmission(10);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: { submission: mockSubmission, createdEntity: {} } },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await approveSubmission(10, undefined, controller.signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/10/approve`,
        {},
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Validation error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(approveSubmission(10)).rejects.toEqual(mockError);
    });
  });

  // ─── rejectSubmission ──────────────────────────────────────────────────────

  describe("rejectSubmission", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request with the rejection reason", async () => {
      const mockResponse = {
        data: { data: mockSubmission },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await rejectSubmission(10, "Does not meet requirements");

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/10/reject`,
        { reason: "Does not meet requirements" },
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockSubmission },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await rejectSubmission(10, "Reason");

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockSubmission },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await rejectSubmission(10, "Reason", controller.signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/10/reject`,
        { reason: "Reason" },
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(rejectSubmission(99, "Reason")).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(rejectSubmission(10, "Reason")).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  // ─── getEntityIntakeSubmission ─────────────────────────────────────────────

  describe("getEntityIntakeSubmission", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockEntitySubmission = {
      submissionId: 10,
      formName: "Test Form",
      submitterName: "John Doe",
      submitterEmail: "john@example.com",
      submittedAt: "2026-01-01T00:00:00Z",
      reviewedAt: null,
      riskTier: null,
      fields: [],
    };

    it("should make a GET request to the correct by-entity URL", async () => {
      const mockResponse = {
        data: { data: mockEntitySubmission },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getEntityIntakeSubmission("model", 5);

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/by-entity/model/5`,
        { signal: undefined },
      );
    });

    it("should return the submission data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockEntitySubmission },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getEntityIntakeSubmission("use_case", 5);

      expect(result).toEqual(mockEntitySubmission);
    });

    it("should return null when the API responds with 404", async () => {
      const notFoundError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(notFoundError);

      const result = await getEntityIntakeSubmission("model", 999);

      expect(result).toBeNull();
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: mockEntitySubmission },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getEntityIntakeSubmission("model", 5, controller.signal);

      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/submissions/by-entity/model/5`,
        { signal: controller.signal },
      );
    });

    it("should rethrow non-404 errors", async () => {
      const serverError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(serverError);

      await expect(getEntityIntakeSubmission("model", 5)).rejects.toEqual(
        serverError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getEntityIntakeSubmission("model", 5)).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  // ─── getLLMSuggestedQuestions ──────────────────────────────────────────────

  describe("getLLMSuggestedQuestions", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request to the suggested-questions endpoint", async () => {
      const mockResponse = {
        data: { data: [] },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await getLLMSuggestedQuestions("model", "AI risk tool", 42);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/forms/suggested-questions`,
        { entityType: "model", context: "AI risk tool", llmKeyId: 42 },
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockSuggestions = [
        { label: "Risk level?", fieldType: "select", category: "risk" },
      ];
      const mockResponse = {
        data: { data: mockSuggestions },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await getLLMSuggestedQuestions("model", "context", 42);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: [] },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await getLLMSuggestedQuestions("model", "context", 42, controller.signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/forms/suggested-questions`,
        { entityType: "model", context: "context", llmKeyId: 42 },
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        getLLMSuggestedQuestions("model", "context", 42),
      ).rejects.toEqual(mockError);
    });
  });

  // ─── getLLMFieldGuidance ───────────────────────────────────────────────────

  describe("getLLMFieldGuidance", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a POST request to the field-guidance endpoint", async () => {
      const mockResponse = {
        data: { data: { guidanceText: "Describe the risk level." } },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await getLLMFieldGuidance("Risk Level", "model", 42);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/forms/field-guidance`,
        { fieldLabel: "Risk Level", entityType: "model", llmKeyId: 42 },
        { signal: undefined },
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: { guidanceText: "Describe the risk level." } },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await getLLMFieldGuidance("Risk Level", "model", 42);

      expect(result).toEqual(mockResponse.data);
    });

    it("should pass the AbortSignal when provided", async () => {
      const mockResponse = {
        data: { data: { guidanceText: "..." } },
        status: 200,
        statusText: "OK",
      };
      const controller = new AbortController();
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await getLLMFieldGuidance("Risk Level", "model", 42, controller.signal);

      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/forms/field-guidance`,
        { fieldLabel: "Risk Level", entityType: "model", llmKeyId: 42 },
        { signal: controller.signal },
      );
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        getLLMFieldGuidance("Risk Level", "model", 42),
      ).rejects.toEqual(mockError);
    });
  });

  // ─── getCaptcha ────────────────────────────────────────────────────────────

  describe("getCaptcha", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the captcha endpoint", async () => {
      const mockResponse = {
        data: { data: { question: "2 + 2?", token: "abc123" } },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getCaptcha();

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/public/captcha`,
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: { question: "2 + 2?", token: "abc123" } },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getCaptcha();

      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getCaptcha()).rejects.toEqual(mockError);
    });
  });

  // ─── getPublicForm ─────────────────────────────────────────────────────────

  describe("getPublicForm", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockPublicFormData = {
      form: {
        id: 1,
        name: "Public Form",
        description: "desc",
        slug: "test-form",
        entityType: IntakeEntityType.MODEL,
        schema: { version: "1.0", fields: [] },
        submitButtonText: "Submit",
      },
    };

    it("should make a GET request without resubmission token when not provided", async () => {
      const mockResponse = {
        data: { data: mockPublicFormData },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getPublicForm("my-org", "test-form");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/public/my-org/test-form`,
      );
    });

    it("should append the resubmission token as a query param when provided", async () => {
      const mockResponse = {
        data: { data: mockPublicFormData },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getPublicForm("my-org", "test-form", "resubmit-token-xyz");

      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/public/my-org/test-form?token=resubmit-token-xyz`,
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockPublicFormData },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getPublicForm("my-org", "test-form");

      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getPublicForm("my-org", "unknown-form")).rejects.toEqual(
        mockError,
      );
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getPublicForm("my-org", "test-form")).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  // ─── submitPublicForm ──────────────────────────────────────────────────────

  describe("submitPublicForm", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const submitData = {
      formData: { name: "John" },
      submitterEmail: "john@example.com",
      captchaToken: "token123",
      captchaAnswer: 4,
    };

    it("should make a POST request to the correct public URL with the provided data", async () => {
      const mockResponse = {
        data: {
          data: {
            submissionId: 1,
            resubmissionToken: "tok",
            message: "Success",
          },
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await submitPublicForm("my-org", "test-form", submitData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/public/my-org/test-form`,
        submitData,
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: {
          data: {
            submissionId: 1,
            resubmissionToken: "tok",
            message: "Success",
          },
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await submitPublicForm("my-org", "test-form", submitData);

      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Validation error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        submitPublicForm("my-org", "test-form", submitData),
      ).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(
        submitPublicForm("my-org", "test-form", submitData),
      ).rejects.toThrow("Connection refused");
    });
  });

  // ─── getPublicFormById ─────────────────────────────────────────────────────

  describe("getPublicFormById", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const mockPublicFormData = {
      form: {
        id: 1,
        name: "Public Form",
        description: "desc",
        slug: "test-form",
        entityType: IntakeEntityType.MODEL,
        schema: { version: "1.0", fields: [] },
        submitButtonText: "Submit",
      },
    };

    it("should make a GET request without resubmission token when not provided", async () => {
      const mockResponse = {
        data: { data: mockPublicFormData },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getPublicFormById("public-id-abc");

      expect(apiServices.get).toHaveBeenCalledTimes(1);
      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/public/by-id/public-id-abc`,
      );
    });

    it("should append the resubmission token as a query param when provided", async () => {
      const mockResponse = {
        data: { data: mockPublicFormData },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      await getPublicFormById("public-id-abc", "resubmit-token-xyz");

      expect(apiServices.get).toHaveBeenCalledWith(
        `${BASE_URL}/public/by-id/public-id-abc?token=resubmit-token-xyz`,
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: { data: mockPublicFormData },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const result = await getPublicFormById("public-id-abc");

      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 404, data: { message: "Not Found" } },
      };
      vi.mocked(apiServices.get).mockRejectedValue(mockError);

      await expect(getPublicFormById("unknown-id")).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getPublicFormById("public-id-abc")).rejects.toThrow(
        "Network timeout",
      );
    });
  });

  // ─── submitPublicFormById ──────────────────────────────────────────────────

  describe("submitPublicFormById", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    const submitData = {
      formData: { name: "Jane" },
      submitterEmail: "jane@example.com",
      captchaToken: "token456",
      captchaAnswer: 7,
    };

    it("should make a POST request to the correct by-id URL", async () => {
      const mockResponse = {
        data: {
          data: {
            submissionId: 2,
            resubmissionToken: "tok2",
            message: "Submitted",
          },
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      await submitPublicFormById("public-id-abc", submitData);

      expect(apiServices.post).toHaveBeenCalledTimes(1);
      expect(apiServices.post).toHaveBeenCalledWith(
        `${BASE_URL}/public/by-id/public-id-abc`,
        submitData,
      );
    });

    it("should return response data on successful API call", async () => {
      const mockResponse = {
        data: {
          data: {
            submissionId: 2,
            resubmissionToken: "tok2",
            message: "Submitted",
          },
        },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const result = await submitPublicFormById("public-id-abc", submitData);

      expect(result).toEqual(mockResponse.data);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 422, data: { message: "Validation error" } },
      };
      vi.mocked(apiServices.post).mockRejectedValue(mockError);

      await expect(
        submitPublicFormById("public-id-abc", submitData),
      ).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(apiServices.post).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(
        submitPublicFormById("public-id-abc", submitData),
      ).rejects.toThrow("Connection refused");
    });
  });
});
