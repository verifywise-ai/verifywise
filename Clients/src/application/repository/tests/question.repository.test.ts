import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createQuestion,
  deleteQuestion,
  getQuestionById,
  updateEUAIActAnswerById,
  updateQuestion,
} from "../question.repository";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockQuestion = {
  id: 1,
  title: "Question title",
  question: "Is this compliant?",
};

describe("question.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getQuestionById", () => {
    it("should fetch question by id with default responseType", async () => {
      const mockResponse = {
        data: mockQuestion,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      const result = await getQuestionById({ id: 1 });

      expect(apiServices.get).toHaveBeenCalledWith("/questions/1", {
        signal: undefined,
        responseType: "json",
      });
      expect(result).toEqual(mockQuestion);
    });

    it("should fetch question by id with custom responseType and signal", async () => {
      const signal = new AbortController().signal;
      const blob = new Blob([JSON.stringify(mockQuestion)], {
        type: "application/json",
      });
      const mockResponse = {
        data: blob,
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.get).mockResolvedValue(mockResponse as any);

      const result = await getQuestionById({
        id: 1,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith("/questions/1", {
        signal,
        responseType: "blob",
      });
      expect(result).toBe(blob);
    });

    it("should propagate get errors", async () => {
      const error = new Error("Network error");
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getQuestionById({ id: 1 })).rejects.toThrow("Network error");
    });

    it("should propagate not found errors", async () => {
      const error = {
        response: { status: 404, statusText: "Not Found" },
      };
      vi.mocked(apiServices.get).mockRejectedValue(error);

      await expect(getQuestionById({ id: 999 })).rejects.toEqual(error);
    });
  });

  describe("createQuestion", () => {
    it("should create a question and return full response", async () => {
      const body = { question: "New question?", type: "yes_no" };
      const mockResponse = {
        data: { ...mockQuestion, ...body },
        status: 201,
        statusText: "Created",
      };
      vi.mocked(apiServices.post).mockResolvedValue(mockResponse as any);

      const result = await createQuestion({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/questions", body);
      expect(result).toEqual(mockResponse);
    });

    it("should handle validation errors on create", async () => {
      const error = {
        response: { status: 422, statusText: "Unprocessable Entity" },
      };
      vi.mocked(apiServices.post).mockRejectedValue(error);

      await expect(createQuestion({ body: {} })).rejects.toEqual(error);
    });
  });

  describe("updateQuestion", () => {
    it("should update a question and return full response", async () => {
      const body = { question: "Updated question?" };
      const mockResponse = {
        data: { ...mockQuestion, ...body },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      const result = await updateQuestion({ id: 1, body });

      expect(apiServices.patch).toHaveBeenCalledWith("/questions/1", body);
      expect(result).toEqual(mockResponse);
    });

    it("should handle forbidden errors on update", async () => {
      const error = {
        response: { status: 403, statusText: "Forbidden" },
      };
      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(updateQuestion({ id: 1, body: {} })).rejects.toEqual(error);
    });
  });

  describe("deleteQuestion", () => {
    it("should delete question and return full response", async () => {
      const mockResponse = {
        data: { success: true },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse as any);

      const result = await deleteQuestion({ id: 1 });

      expect(apiServices.delete).toHaveBeenCalledWith("/questions/1");
      expect(result).toEqual(mockResponse);
    });

    it("should handle not found errors on delete", async () => {
      const error = {
        response: { status: 404, statusText: "Not Found" },
      };
      vi.mocked(apiServices.delete).mockRejectedValue(error);

      await expect(deleteQuestion({ id: 999 })).rejects.toEqual(error);
    });
  });

  describe("updateEUAIActAnswerById", () => {
    it("should send application/json header when body is plain object", async () => {
      const body = { answer: "yes" };
      const mockResponse = {
        data: { updated: true },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      const result = await updateEUAIActAnswerById({ answerId: 10, body });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/eu-ai-act/saveAnswer/10",
        body,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      expect(result).toEqual(mockResponse);
    });

    it("should send multipart/form-data header when body is FormData", async () => {
      const formData = new FormData();
      formData.append("answer", "yes");

      const mockResponse = {
        data: { updated: true },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse as any);

      const result = await updateEUAIActAnswerById({
        answerId: 15,
        body: formData,
      });

      expect(apiServices.patch).toHaveBeenCalledWith(
        "/eu-ai-act/saveAnswer/15",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      expect(result).toEqual(mockResponse);
    });

    it("should propagate patch errors", async () => {
      const error = new Error("Failed to save answer");
      vi.mocked(apiServices.patch).mockRejectedValue(error);

      await expect(
        updateEUAIActAnswerById({ answerId: 1, body: { answer: "no" } }),
      ).rejects.toThrow("Failed to save answer");
    });
  });
});
