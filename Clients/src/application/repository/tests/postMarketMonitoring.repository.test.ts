import { PMMReportWithDetails } from "src/domain/types/PostMarketMonitoring";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pmmService } from "../../../infrastructure/api/postMarketMonitoringService";
import {
  addQuestion,
  createConfig,
  deleteConfig,
  deleteQuestion,
  downloadReport,
  flagConcern,
  getActiveCycle,
  getConfigByProjectId,
  getCycleById,
  getOrgQuestions,
  getQuestions,
  getReports,
  PMMConfigWithDetails,
  PMMCycleWithDetails,
  PMMQuestion,
  reassignStakeholder,
  reorderQuestions,
  saveResponses,
  startNewCycle,
  submitCycle,
  updateConfig,
  updateQuestion,
} from "../postMarketMonitoring.repository";

vi.mock("../../../infrastructure/api/postMarketMonitoringService", () => ({
  pmmService: {
    getConfigByProjectId: vi.fn(),
    createConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
    getQuestions: vi.fn(),
    getOrgQuestions: vi.fn(),
    addQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
    reorderQuestions: vi.fn(),
    getActiveCycle: vi.fn(),
    getCycleById: vi.fn(),
    saveResponses: vi.fn(),
    submitCycle: vi.fn(),
    flagConcern: vi.fn(),
    getReports: vi.fn(),
    downloadReport: vi.fn(),
    reassignStakeholder: vi.fn(),
    startNewCycle: vi.fn(),
  },
}));

const mockConfig: PMMConfigWithDetails = {
  id: 1,
  escalation_days: 7,
  frequency_unit: "days",
  frequency_value: 30,
  is_active: true,
  project_id: 10,
  created_at: "2026-03-12T00:00:00Z",
  updated_at: "2026-03-12T00:00:00Z",
  notification_hour: 9,
  reminder_days: 3,
  active_cycle: {
    id: 1,
    config_id: 1,
    cycle_number: 1,
    status: "in_progress",
    due_at: "2026-04-12T00:00:00Z",
    started_at: "2026-03-12T00:00:00Z",
    completed_at: "2026-04-10T00:00:00Z",
    assigned_stakeholder_id: 1,
    completed_by: 1,
    created_at: "2026-03-12T00:00:00Z",
    escalation_sent_at: "2026-03-19T00:00:00Z",
    reminder_sent_at: "2026-04-09T00:00:00Z",
  },
};

const mockQuestion: PMMQuestion = {
  id: 1,
  config_id: 1,
  allows_flag_for_concern: true,
  display_order: 1,
  is_required: true,
  is_system_default: false,
  question_text: "Is the model's performance acceptable?",
  question_type: "yes_no",
  created_at: "2026-03-12T00:00:00Z",
  eu_ai_act_article: "Article 14",
  options: undefined,
  suggestion_text:
    "Consider if the model meets the performance criteria defined in your project.",
};

const mockCycle: PMMCycleWithDetails = {
  id: 1,
  config_id: 1,
  cycle_number: 1,
  status: "in_progress",
  due_at: "2026-04-12T00:00:00Z",
  started_at: "2026-03-12T00:00:00Z",
  completed_at: "2026-04-10T00:00:00Z",
  assigned_stakeholder_id: 1,
  completed_by: 1,
  created_at: "2026-03-12T00:00:00Z",
  escalation_sent_at: "2026-03-19T00:00:00Z",
  reminder_sent_at: "2026-04-09T00:00:00Z",
  completed_by_name: "John Doe",
  days_until_due: 29,
  has_flagged_concerns: false,
  is_overdue: false,
  project_id: 10,
  project_title: "Project Alpha",
  questions_count: 5,
  responses_count: 3,
  stakeholder_email: "",
  stakeholder_name: "John Doe",
};

const mockReport: PMMReportWithDetails = {
  id: 1,
  cycle_id: 1,
  project_id: 10,
  context_snapshot: {
    captured_at: "2026-04-10T00:00:00Z",
    high_risk_count: 1,
    low_risk_count: 2,
    medium_risk_count: 1,
    model_risks_count: 4,
    models_count: 2,
    risks_count: 5,
    use_case_status: "monitored",
    use_case_title: "Use Case A",
    vendor_risks_count: 3,
    vendors_count: 1,
  },
  completed_at: "2026-04-10T00:00:00Z",
  completed_by_name: "John Doe",
  cycle_number: 1,
  project_title: "Project Alpha",
  file_id: 1,
  file_name: "report.pdf",
  generated_at: "2026-04-10T00:00:00Z",
  generated_by: 1,
  has_flagged_concerns: false,
};

describe("postMarketMonitoring.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== Configuration ====================

  describe("getConfigByProjectId", () => {
    it("should fetch config by project ID", async () => {
      vi.mocked(pmmService.getConfigByProjectId).mockResolvedValue(mockConfig);

      const result = await getConfigByProjectId(10);

      expect(pmmService.getConfigByProjectId).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockConfig);
    });

    it("should handle different project IDs", async () => {
      vi.mocked(pmmService.getConfigByProjectId).mockResolvedValue(mockConfig);

      await getConfigByProjectId(25);

      expect(pmmService.getConfigByProjectId).toHaveBeenCalledWith(25);
    });

    it("should throw error when config not found", async () => {
      const error = new Error("Config not found");
      vi.mocked(pmmService.getConfigByProjectId).mockRejectedValue(error);

      await expect(getConfigByProjectId(999)).rejects.toThrow(
        "Config not found",
      );
    });

    it("should handle API errors", async () => {
      const error = new Error("Network error");
      vi.mocked(pmmService.getConfigByProjectId).mockRejectedValue(error);

      await expect(getConfigByProjectId(10)).rejects.toThrow("Network error");
    });
  });

  describe("createConfig", () => {
    it("should create a new config", async () => {
      const createData = {
        projectId: 10,
        enabled: true,
        maxResponseDays: 30,
      };
      vi.mocked(pmmService.createConfig).mockResolvedValue(mockConfig);

      const result = await createConfig(createData as any);

      expect(pmmService.createConfig).toHaveBeenCalledWith(createData);
      expect(result).toEqual(mockConfig);
    });

    it("should handle validation errors", async () => {
      const error = new Error("Validation failed");
      vi.mocked(pmmService.createConfig).mockRejectedValue(error);

      await expect(createConfig({} as any)).rejects.toThrow(
        "Validation failed",
      );
    });

    it("should handle conflict on duplicate config", async () => {
      const error = new Error("Config already exists");
      vi.mocked(pmmService.createConfig).mockRejectedValue(error);

      await expect(createConfig({} as any)).rejects.toThrow(
        "Config already exists",
      );
    });
  });

  describe("updateConfig", () => {
    it("should update an existing config", async () => {
      const updateData = { enabled: false, maxResponseDays: 45 };
      const updatedConfig = { ...mockConfig, ...updateData };
      vi.mocked(pmmService.updateConfig).mockResolvedValue(updatedConfig);

      const result = await updateConfig(1, updateData as any);

      expect(pmmService.updateConfig).toHaveBeenCalledWith(1, updateData);
      expect(result).toEqual(updatedConfig);
    });

    it("should handle config not found", async () => {
      const error = new Error("Config not found");
      vi.mocked(pmmService.updateConfig).mockRejectedValue(error);

      await expect(updateConfig(999, {} as any)).rejects.toThrow(
        "Config not found",
      );
    });

    it("should pass correct config ID", async () => {
      vi.mocked(pmmService.updateConfig).mockResolvedValue(mockConfig);

      await updateConfig(5, { enabled: true } as any);

      expect(pmmService.updateConfig).toHaveBeenCalledWith(5, {
        enabled: true,
      });
    });
  });

  describe("deleteConfig", () => {
    it("should delete a config", async () => {
      vi.mocked(pmmService.deleteConfig).mockResolvedValue(undefined);

      await deleteConfig(1);

      expect(pmmService.deleteConfig).toHaveBeenCalledWith(1);
    });

    it("should handle config not found on delete", async () => {
      const error = new Error("Config not found");
      vi.mocked(pmmService.deleteConfig).mockRejectedValue(error);

      await expect(deleteConfig(999)).rejects.toThrow("Config not found");
    });

    it("should handle forbidden delete", async () => {
      const error = new Error("Forbidden");
      vi.mocked(pmmService.deleteConfig).mockRejectedValue(error);

      await expect(deleteConfig(1)).rejects.toThrow("Forbidden");
    });
  });

  // ==================== Questions ====================

  describe("getQuestions", () => {
    it("should fetch questions for a config", async () => {
      const questions: PMMQuestion[] = [
        mockQuestion,
        { ...mockQuestion, id: 2 },
      ];
      vi.mocked(pmmService.getQuestions).mockResolvedValue(questions);

      const result = await getQuestions(1);

      expect(pmmService.getQuestions).toHaveBeenCalledWith(1);
      expect(result).toEqual(questions);
    });

    it("should return empty array when no questions", async () => {
      vi.mocked(pmmService.getQuestions).mockResolvedValue([]);

      const result = await getQuestions(1);

      expect(result).toEqual([]);
    });

    it("should handle config not found", async () => {
      const error = new Error("Config not found");
      vi.mocked(pmmService.getQuestions).mockRejectedValue(error);

      await expect(getQuestions(999)).rejects.toThrow("Config not found");
    });
  });

  describe("getOrgQuestions", () => {
    it("should fetch organization-level template questions", async () => {
      const orgQuestions = [
        { ...mockQuestion, isTemplate: true, configId: null },
      ];
      vi.mocked(pmmService.getOrgQuestions).mockResolvedValue(
        orgQuestions as any,
      );

      const result = await getOrgQuestions();

      expect(pmmService.getOrgQuestions).toHaveBeenCalled();
      expect(result).toEqual(orgQuestions);
    });

    it("should return empty array when no template questions", async () => {
      vi.mocked(pmmService.getOrgQuestions).mockResolvedValue([]);

      const result = await getOrgQuestions();

      expect(result).toEqual([]);
    });
  });

  describe("addQuestion", () => {
    it("should add a new question to config", async () => {
      const newQuestion = {
        question: "New question?",
        questionType: "yes_no",
      };
      vi.mocked(pmmService.addQuestion).mockResolvedValue({
        ...mockQuestion,
        ...newQuestion,
      });

      const result = await addQuestion(1, newQuestion as any);

      expect(pmmService.addQuestion).toHaveBeenCalledWith(1, newQuestion);
      expect(result).toEqual(expect.objectContaining(newQuestion));
    });

    it("should handle validation errors when adding question", async () => {
      const error = new Error("Invalid question type");
      vi.mocked(pmmService.addQuestion).mockRejectedValue(error);

      await expect(addQuestion(1, {} as any)).rejects.toThrow(
        "Invalid question type",
      );
    });
  });

  describe("updateQuestion", () => {
    it("should update a question", async () => {
      const updateData = { question: "Updated question?" };
      const updated = { ...mockQuestion, ...updateData };
      vi.mocked(pmmService.updateQuestion).mockResolvedValue(updated);

      const result = await updateQuestion(1, updateData as any);

      expect(pmmService.updateQuestion).toHaveBeenCalledWith(1, updateData);
      expect(result).toEqual(updated);
    });

    it("should handle question not found", async () => {
      const error = new Error("Question not found");
      vi.mocked(pmmService.updateQuestion).mockRejectedValue(error);

      await expect(updateQuestion(999, {} as any)).rejects.toThrow(
        "Question not found",
      );
    });
  });

  describe("deleteQuestion", () => {
    it("should delete a question", async () => {
      vi.mocked(pmmService.deleteQuestion).mockResolvedValue(undefined);

      await deleteQuestion(1);

      expect(pmmService.deleteQuestion).toHaveBeenCalledWith(1);
    });

    it("should handle question not found on delete", async () => {
      const error = new Error("Question not found");
      vi.mocked(pmmService.deleteQuestion).mockRejectedValue(error);

      await expect(deleteQuestion(999)).rejects.toThrow("Question not found");
    });
  });

  describe("reorderQuestions", () => {
    it("should reorder questions", async () => {
      const orders = [
        { id: 1, display_order: 2 },
        { id: 2, display_order: 1 },
      ];
      vi.mocked(pmmService.reorderQuestions).mockResolvedValue(undefined);

      await reorderQuestions(orders);

      expect(pmmService.reorderQuestions).toHaveBeenCalledWith(orders);
    });

    it("should handle invalid order data", async () => {
      const error = new Error("Invalid order data");
      vi.mocked(pmmService.reorderQuestions).mockRejectedValue(error);

      await expect(reorderQuestions([])).rejects.toThrow("Invalid order data");
    });

    it("should handle empty orders array", async () => {
      vi.mocked(pmmService.reorderQuestions).mockResolvedValue(undefined);

      await reorderQuestions([]);

      expect(pmmService.reorderQuestions).toHaveBeenCalledWith([]);
    });
  });

  // ==================== Cycles ====================

  describe("getActiveCycle", () => {
    it("should fetch active cycle for a project", async () => {
      vi.mocked(pmmService.getActiveCycle).mockResolvedValue(mockCycle);

      const result = await getActiveCycle(10);

      expect(pmmService.getActiveCycle).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockCycle);
    });

    it("should return null when no active cycle", async () => {
      vi.mocked(pmmService.getActiveCycle).mockResolvedValue(null);

      const result = await getActiveCycle(10);

      expect(result).toBeNull();
    });

    it("should handle project not found", async () => {
      const error = new Error("Project not found");
      vi.mocked(pmmService.getActiveCycle).mockRejectedValue(error);

      await expect(getActiveCycle(999)).rejects.toThrow("Project not found");
    });
  });

  describe("getCycleById", () => {
    it("should fetch cycle by ID", async () => {
      vi.mocked(pmmService.getCycleById).mockResolvedValue(mockCycle);

      const result = await getCycleById(1);

      expect(pmmService.getCycleById).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockCycle);
    });

    it("should handle cycle not found", async () => {
      const error = new Error("Cycle not found");
      vi.mocked(pmmService.getCycleById).mockRejectedValue(error);

      await expect(getCycleById(999)).rejects.toThrow("Cycle not found");
    });

    it("should handle different cycle IDs", async () => {
      vi.mocked(pmmService.getCycleById).mockResolvedValue(mockCycle);

      await getCycleById(25);

      expect(pmmService.getCycleById).toHaveBeenCalledWith(25);
    });
  });

  describe("saveResponses", () => {
    it("should save responses for a cycle", async () => {
      const responses = [
        { questionId: 1, response: true },
        { questionId: 2, response: "Some concern" },
      ];
      vi.mocked(pmmService.saveResponses).mockResolvedValue(undefined);

      await saveResponses(1, responses as any);

      expect(pmmService.saveResponses).toHaveBeenCalledWith(1, responses);
    });

    it("should handle empty responses array", async () => {
      vi.mocked(pmmService.saveResponses).mockResolvedValue(undefined);

      await saveResponses(1, []);

      expect(pmmService.saveResponses).toHaveBeenCalledWith(1, []);
    });

    it("should handle cycle not found", async () => {
      const error = new Error("Cycle not found");
      vi.mocked(pmmService.saveResponses).mockRejectedValue(error);

      await expect(saveResponses(999, [])).rejects.toThrow("Cycle not found");
    });

    it("should handle validation errors on save", async () => {
      const error = new Error("Invalid response data");
      vi.mocked(pmmService.saveResponses).mockRejectedValue(error);

      await expect(saveResponses(1, [{} as any])).rejects.toThrow(
        "Invalid response data",
      );
    });
  });

  describe("submitCycle", () => {
    it("should submit completed cycle", async () => {
      const submitData = {
        responses: [],
        stakeholderId: 1,
      };
      const response = {
        message: "Cycle submitted",
        report_generated: true,
        report_filename: "report.pdf",
      };
      vi.mocked(pmmService.submitCycle).mockResolvedValue(response);

      const result = await submitCycle(1, submitData as any);

      expect(pmmService.submitCycle).toHaveBeenCalledWith(1, submitData);
      expect(result).toEqual(response);
      expect(result.report_generated).toBe(true);
    });

    it("should handle submission without report generation", async () => {
      const response = {
        message: "Cycle submitted",
        report_generated: false,
      };
      vi.mocked(pmmService.submitCycle).mockResolvedValue(response);

      const result = await submitCycle(1, {} as any);

      expect(result.report_generated).toBe(false);
      expect(result.report_filename).toBeUndefined();
    });

    it("should handle cycle not found on submit", async () => {
      const error = new Error("Cycle not found");
      vi.mocked(pmmService.submitCycle).mockRejectedValue(error);

      await expect(submitCycle(999, {} as any)).rejects.toThrow(
        "Cycle not found",
      );
    });

    it("should handle submission with incomplete responses", async () => {
      const error = new Error("Incomplete responses");
      vi.mocked(pmmService.submitCycle).mockRejectedValue(error);

      await expect(submitCycle(1, {} as any)).rejects.toThrow(
        "Incomplete responses",
      );
    });
  });

  describe("flagConcern", () => {
    it("should flag a concern with boolean response", async () => {
      vi.mocked(pmmService.flagConcern).mockResolvedValue(undefined);

      await flagConcern(1, 1, true);

      expect(pmmService.flagConcern).toHaveBeenCalledWith(1, 1, true);
    });

    it("should flag a concern with string response", async () => {
      vi.mocked(pmmService.flagConcern).mockResolvedValue(undefined);

      await flagConcern(1, 1, "Model behavior concern");

      expect(pmmService.flagConcern).toHaveBeenCalledWith(
        1,
        1,
        "Model behavior concern",
      );
    });

    it("should flag a concern with array response", async () => {
      const concerns = ["Concern 1", "Concern 2"];
      vi.mocked(pmmService.flagConcern).mockResolvedValue(undefined);

      await flagConcern(1, 1, concerns);

      expect(pmmService.flagConcern).toHaveBeenCalledWith(1, 1, concerns);
    });

    it("should handle cycle not found", async () => {
      const error = new Error("Cycle not found");
      vi.mocked(pmmService.flagConcern).mockRejectedValue(error);

      await expect(flagConcern(999, 1, true)).rejects.toThrow(
        "Cycle not found",
      );
    });

    it("should handle question not found", async () => {
      const error = new Error("Question not found");
      vi.mocked(pmmService.flagConcern).mockRejectedValue(error);

      await expect(flagConcern(1, 999, true)).rejects.toThrow(
        "Question not found",
      );
    });
  });

  // ==================== Reports ====================

  describe("getReports", () => {
    it("should fetch reports with filters", async () => {
      const filters = { projectId: 10, status: "completed" };
      const reports: PMMReportWithDetails[] = [
        mockReport,
        {
          ...mockReport,
          id: 2,
        },
      ];
      vi.mocked(pmmService.getReports).mockResolvedValue({
        reports,
        total: 2,
        page: 1,
        limit: 10,
      });

      const result = await getReports(filters as any);

      expect(pmmService.getReports).toHaveBeenCalledWith(filters);
      expect(result.reports).toEqual(reports);
    });

    it("should return empty reports array", async () => {
      vi.mocked(pmmService.getReports).mockResolvedValue({
        reports: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      const result = await getReports({} as any);

      expect(result.reports).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should handle invalid filter parameters", async () => {
      const error = new Error("Invalid filter parameters");
      vi.mocked(pmmService.getReports).mockRejectedValue(error);

      await expect(getReports({} as any)).rejects.toThrow(
        "Invalid filter parameters",
      );
    });
  });

  describe("downloadReport", () => {
    it("should download a report", async () => {
      vi.mocked(pmmService.downloadReport).mockResolvedValue(undefined);

      await downloadReport(1);

      expect(pmmService.downloadReport).toHaveBeenCalledWith(1);
    });

    it("should handle report not found", async () => {
      const error = new Error("Report not found");
      vi.mocked(pmmService.downloadReport).mockRejectedValue(error);

      await expect(downloadReport(999)).rejects.toThrow("Report not found");
    });

    it("should handle different report IDs", async () => {
      vi.mocked(pmmService.downloadReport).mockResolvedValue(undefined);

      await downloadReport(25);

      expect(pmmService.downloadReport).toHaveBeenCalledWith(25);
    });
  });

  // ==================== Admin ====================

  describe("reassignStakeholder", () => {
    it("should reassign stakeholder for a cycle", async () => {
      vi.mocked(pmmService.reassignStakeholder).mockResolvedValue(undefined);

      await reassignStakeholder(1, 5);

      expect(pmmService.reassignStakeholder).toHaveBeenCalledWith(1, 5);
    });

    it("should handle cycle not found on reassign", async () => {
      const error = new Error("Cycle not found");
      vi.mocked(pmmService.reassignStakeholder).mockRejectedValue(error);

      await expect(reassignStakeholder(999, 5)).rejects.toThrow(
        "Cycle not found",
      );
    });

    it("should handle stakeholder not found", async () => {
      const error = new Error("Stakeholder not found");
      vi.mocked(pmmService.reassignStakeholder).mockRejectedValue(error);

      await expect(reassignStakeholder(1, 999)).rejects.toThrow(
        "Stakeholder not found",
      );
    });

    it("should handle forbidden reassignment", async () => {
      const error = new Error("Forbidden");
      vi.mocked(pmmService.reassignStakeholder).mockRejectedValue(error);

      await expect(reassignStakeholder(1, 5)).rejects.toThrow("Forbidden");
    });
  });

  describe("startNewCycle", () => {
    it("should start a new monitoring cycle", async () => {
      const newCycle = { ...mockCycle, id: 2 };
      vi.mocked(pmmService.startNewCycle).mockResolvedValue(newCycle);

      const result = await startNewCycle(10);

      expect(pmmService.startNewCycle).toHaveBeenCalledWith(10);
      expect(result).toEqual(newCycle);
    });

    it("should handle project not found", async () => {
      const error = new Error("Project not found");
      vi.mocked(pmmService.startNewCycle).mockRejectedValue(error);

      await expect(startNewCycle(999)).rejects.toThrow("Project not found");
    });

    it("should handle cycle already active", async () => {
      const error = new Error("Cycle already active");
      vi.mocked(pmmService.startNewCycle).mockRejectedValue(error);

      await expect(startNewCycle(10)).rejects.toThrow("Cycle already active");
    });

    it("should handle config not found for project", async () => {
      const error = new Error("Config not found");
      vi.mocked(pmmService.startNewCycle).mockRejectedValue(error);

      await expect(startNewCycle(10)).rejects.toThrow("Config not found");
    });

    it("should handle different project IDs", async () => {
      const newCycle = { ...mockCycle, projectId: 25 };
      vi.mocked(pmmService.startNewCycle).mockResolvedValue(newCycle);

      const result = await startNewCycle(25);

      expect(pmmService.startNewCycle).toHaveBeenCalledWith(25);
      expect(result.project_id).toBe(10);
    });
  });
});
