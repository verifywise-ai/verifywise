import { automationsService } from "../../../infrastructure/api/automationsService";
import {
  createAutomation,
  deleteAutomation,
  getActionsByTriggerId,
  getAllAutomations,
  getAutomation,
  getAutomationHistory,
  getAutomationStats,
  getTriggers,
  updateAutomation,
} from "../automations.repository";

vi.mock("../../../infrastructure/api/automationsService", () => {
  return {
    automationsService: {
      getAll: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getTriggers: vi.fn(),
      getActionsByTriggerId: vi.fn(),
      getHistory: vi.fn(),
      getStats: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test Automations Repository", () => {
  describe("getAllAutomations", () => {
    it("should call automationsService.getAll and return result", async () => {
      const mockData = [{ id: 1, name: "Automation 1" }];
      vi.mocked(automationsService.getAll).mockResolvedValue(mockData as any);

      const response = await getAllAutomations();

      expect(automationsService.getAll).toHaveBeenCalledWith();
      expect(response).toEqual(mockData);
    });
  });

  describe("getAutomation", () => {
    it("should call automationsService.getById with id and return result", async () => {
      const mockData = { id: 10, name: "Automation 10" };
      vi.mocked(automationsService.getById).mockResolvedValue(mockData as any);

      const response = await getAutomation(10);

      expect(automationsService.getById).toHaveBeenCalledWith(10);
      expect(response).toEqual(mockData);
    });
  });

  describe("createAutomation", () => {
    it("should call automationsService.create with payload and return result", async () => {
      const payload = {
        name: "New Automation",
        trigger_id: 1,
        actions: [],
      };
      const mockData = { id: 11, ...payload };
      vi.mocked(automationsService.create).mockResolvedValue(mockData as any);

      const response = await createAutomation(payload as any);

      expect(automationsService.create).toHaveBeenCalledWith(payload);
      expect(response).toEqual(mockData);
    });
  });

  describe("updateAutomation", () => {
    it("should call automationsService.update with id and payload and return result", async () => {
      const id = 12;
      const payload = {
        name: "Updated Automation",
      };
      const mockData = { id, ...payload };
      vi.mocked(automationsService.update).mockResolvedValue(mockData as any);

      const response = await updateAutomation(id, payload as any);

      expect(automationsService.update).toHaveBeenCalledWith(id, payload);
      expect(response).toEqual(mockData);
    });
  });

  describe("deleteAutomation", () => {
    it("should call automationsService.delete with id and return result", async () => {
      vi.mocked(automationsService.delete).mockResolvedValue(undefined as any);

      const response = await deleteAutomation(13);

      expect(automationsService.delete).toHaveBeenCalledWith(13);
      expect(response).toBeUndefined();
    });
  });

  describe("getTriggers", () => {
    it("should call automationsService.getTriggers and return result", async () => {
      const mockData = [{ id: 1, key: "vendor_review_date" }];
      vi.mocked(automationsService.getTriggers).mockResolvedValue(
        mockData as any,
      );

      const response = await getTriggers();

      expect(automationsService.getTriggers).toHaveBeenCalledWith();
      expect(response).toEqual(mockData);
    });
  });

  describe("getActionsByTriggerId", () => {
    it("should call automationsService.getActionsByTriggerId with triggerId and return result", async () => {
      const triggerId = 5;
      const mockData = [{ id: 2, key: "send_email" }];
      vi.mocked(automationsService.getActionsByTriggerId).mockResolvedValue(
        mockData as any,
      );

      const response = await getActionsByTriggerId(triggerId);

      expect(automationsService.getActionsByTriggerId).toHaveBeenCalledWith(
        triggerId,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("getAutomationHistory", () => {
    it("should call automationsService.getHistory with automationId and params", async () => {
      const automationId = 15;
      const params = { limit: 10, offset: 20 };
      const mockData = {
        items: [{ id: 1, status: "success" }],
        total: 1,
      };
      vi.mocked(automationsService.getHistory).mockResolvedValue(
        mockData as any,
      );

      const response = await getAutomationHistory(automationId, params);

      expect(automationsService.getHistory).toHaveBeenCalledWith(
        automationId,
        params,
      );
      expect(response).toEqual(mockData);
    });

    it("should call automationsService.getHistory with undefined params when not provided", async () => {
      const automationId = 16;
      const mockData = {
        items: [],
        total: 0,
      };
      vi.mocked(automationsService.getHistory).mockResolvedValue(
        mockData as any,
      );

      const response = await getAutomationHistory(automationId);

      expect(automationsService.getHistory).toHaveBeenCalledWith(
        automationId,
        undefined,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("getAutomationStats", () => {
    it("should call automationsService.getStats with automationId and return result", async () => {
      const automationId = 17;
      const mockData = {
        total_runs: 10,
        successful_runs: 8,
        failed_runs: 2,
      };
      vi.mocked(automationsService.getStats).mockResolvedValue(mockData as any);

      const response = await getAutomationStats(automationId);

      expect(automationsService.getStats).toHaveBeenCalledWith(automationId);
      expect(response).toEqual(mockData);
    });
  });
});
