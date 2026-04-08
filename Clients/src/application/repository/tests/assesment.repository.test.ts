import { apiServices } from "../../../infrastructure/api/networkServices";
import {
  createAssessment,
  deleteAssessment,
  getAllAssessmentTopics,
  getAssessmentAnswers,
  getAssessmentById,
  getAssessmentProgress,
  getAssessmentTopicById,
  updateAssessment,
} from "../assesment.repository";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test Assessment Repository", () => {
  describe("getAssessmentById", () => {
    it("should make a get request with default responseType and return response.data", async () => {
      const id = "123";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { data: { id: 123, name: "Assessment" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAssessmentById({ id, signal });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/assessments/project/byid/123",
        {
          signal,
          responseType: "json",
        },
      );
      expect(response).toEqual(mockResponse.data);
    });

    it("should make a get request with custom responseType", async () => {
      const id = "123";
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: "blob-data",
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAssessmentById({
        id,
        signal,
        responseType: "blob",
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/assessments/project/byid/123",
        {
          signal,
          responseType: "blob",
        },
      );
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("createAssessment", () => {
    it("should make a post request to create assessment", async () => {
      const body = {
        project_framework_id: 10,
        assessment_name: "New Assessment",
      };
      const mockResponse = {
        data: { data: { id: 1, ...body } },
        status: 201,
        statusText: "Created",
      };

      vi.mocked(apiServices.post).mockResolvedValue(mockResponse);

      const response = await createAssessment({ body });

      expect(apiServices.post).toHaveBeenCalledWith("/assessments", body);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("updateAssessment", () => {
    it("should make a patch request to update assessment", async () => {
      const id = "22";
      const body = {
        assessment_name: "Updated Assessment",
      };
      const mockResponse = {
        data: { data: { id: 22, ...body } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.patch).mockResolvedValue(mockResponse);

      const response = await updateAssessment({ id, body });

      expect(apiServices.patch).toHaveBeenCalledWith("/assessments/22", body);
      expect(response).toEqual(mockResponse);
    });
  });

  describe("deleteAssessment", () => {
    it("should make a delete request to remove assessment", async () => {
      const id = "22";
      const mockResponse = {
        data: { data: { message: "Deleted" } },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.delete).mockResolvedValue(mockResponse);

      const response = await deleteAssessment({ id });

      expect(apiServices.delete).toHaveBeenCalledWith("/assessments/22");
      expect(response).toEqual(mockResponse);
    });
  });

  describe("getAssessmentProgress", () => {
    it("should make a get request for assessment progress with signal", async () => {
      const projectFrameworkId = 10;
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { progress: 70 },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAssessmentProgress({
        projectFrameworkId,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/assessments/progress/10",
        { signal },
      );
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("getAssessmentAnswers", () => {
    it("should make a get request for assessment answers", async () => {
      const assessmentId = "99";
      const mockResponse = {
        data: { answers: [] },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAssessmentAnswers({ assessmentId });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/assessments/getAnswaers/99",
      );
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("getAssessmentTopicById", () => {
    it("should make a get request with topicId and projectFrameworkId", async () => {
      const topicId = 5;
      const projectFrameworkId = 10;
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { id: 5, title: "Topic" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAssessmentTopicById({
        topicId,
        projectFrameworkId,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/topicById?topicId=5&projectFrameworkId=10",
        { signal },
      );
      expect(response).toEqual(mockResponse.data);
    });

    it("should include undefined when projectFrameworkId is not provided", async () => {
      const topicId = 5;
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: { id: 5, title: "Topic" },
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAssessmentTopicById({
        topicId,
        signal,
      });

      expect(apiServices.get).toHaveBeenCalledWith(
        "/eu-ai-act/topicById?topicId=5&projectFrameworkId=undefined",
        { signal },
      );
      expect(response).toEqual(mockResponse.data);
    });
  });

  describe("getAllAssessmentTopics", () => {
    it("should make a get request with signal when provided", async () => {
      const signal: AbortSignal = new AbortController().signal;
      const mockResponse = {
        data: [{ id: 1, title: "Topic A" }],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAllAssessmentTopics({ signal });

      expect(apiServices.get).toHaveBeenCalledWith("/eu-ai-act/topics", {
        signal,
      });
      expect(response).toEqual(mockResponse.data);
    });

    it("should make a get request with undefined signal by default", async () => {
      const mockResponse = {
        data: [],
        status: 200,
        statusText: "OK",
      };

      vi.mocked(apiServices.get).mockResolvedValue(mockResponse);

      const response = await getAllAssessmentTopics();

      expect(apiServices.get).toHaveBeenCalledWith("/eu-ai-act/topics", {
        signal: undefined,
      });
      expect(response).toEqual(mockResponse.data);
    });
  });
});
