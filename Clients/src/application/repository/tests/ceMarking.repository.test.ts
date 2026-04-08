import { ceMarkingService } from "../../../infrastructure/api/ceMarkingService";
import {
  getAllEvidences,
  getAllIncidents,
  getAllPolicies,
  getCEMarking,
  updateCEMarking,
  updateClassificationAndScope,
  updateConformityStep,
  updateDeclaration,
  updateLinkedEvidences,
  updateLinkedIncidents,
  updateLinkedPolicies,
  updateRegistration,
} from "../ceMarking.repository";

vi.mock("../../../infrastructure/api/ceMarkingService", () => {
  return {
    ceMarkingService: {
      getCEMarking: vi.fn(),
      updateCEMarking: vi.fn(),
      updateConformityStep: vi.fn(),
      updateClassificationAndScope: vi.fn(),
      updateDeclaration: vi.fn(),
      updateRegistration: vi.fn(),
      getAllPolicies: vi.fn(),
      getAllEvidences: vi.fn(),
      getAllIncidents: vi.fn(),
      updateLinkedPolicies: vi.fn(),
      updateLinkedEvidences: vi.fn(),
      updateLinkedIncidents: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Test CE Marking Repository", () => {
  describe("getCEMarking", () => {
    it("should call ceMarkingService.getCEMarking with projectId and return result", async () => {
      const projectId = "proj-1";
      const mockData = { projectId, declarationStatus: "draft" };
      vi.mocked(ceMarkingService.getCEMarking).mockResolvedValue(
        mockData as any,
      );

      const response = await getCEMarking(projectId);

      expect(ceMarkingService.getCEMarking).toHaveBeenCalledWith(projectId);
      expect(response).toEqual(mockData);
    });
  });

  describe("updateCEMarking", () => {
    it("should call ceMarkingService.updateCEMarking with projectId and data", async () => {
      const projectId = "proj-1";
      const payload = { declarationStatus: "signed" };
      const mockData = { success: true };
      vi.mocked(ceMarkingService.updateCEMarking).mockResolvedValue(
        mockData as any,
      );

      const response = await updateCEMarking(projectId, payload as any);

      expect(ceMarkingService.updateCEMarking).toHaveBeenCalledWith(
        projectId,
        payload,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("updateConformityStep", () => {
    it("should call ceMarkingService.updateConformityStep with projectId, stepId and stepData", async () => {
      const projectId = "proj-1";
      const stepId = 2;
      const stepData = {
        description: "Step updated",
        status: "completed",
        owner: "john.doe",
        dueDate: "2026-03-01",
        completedDate: "2026-02-26",
      };
      const mockData = { id: stepId, ...stepData };
      vi.mocked(ceMarkingService.updateConformityStep).mockResolvedValue(
        mockData as any,
      );

      const response = await updateConformityStep(projectId, stepId, stepData);

      expect(ceMarkingService.updateConformityStep).toHaveBeenCalledWith(
        projectId,
        stepId,
        stepData,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("updateClassificationAndScope", () => {
    it("should call ceMarkingService.updateClassificationAndScope with projectId and data", async () => {
      const projectId = "proj-1";
      const payload = {
        isHighRiskAISystem: true,
        roleInProduct: "provider",
        annexIIICategory: "annex-1",
      };
      const mockData = { success: true };
      vi.mocked(
        ceMarkingService.updateClassificationAndScope,
      ).mockResolvedValue(mockData as any);

      const response = await updateClassificationAndScope(projectId, payload);

      expect(
        ceMarkingService.updateClassificationAndScope,
      ).toHaveBeenCalledWith(projectId, payload);
      expect(response).toEqual(mockData);
    });
  });

  describe("updateDeclaration", () => {
    it("should call ceMarkingService.updateDeclaration with projectId and data", async () => {
      const projectId = "proj-1";
      const payload = {
        declarationStatus: "signed",
        signedOn: "2026-02-26",
        signatory: "Jane Doe",
        declarationDocument: "doc-url",
      };
      const mockData = { success: true };
      vi.mocked(ceMarkingService.updateDeclaration).mockResolvedValue(
        mockData as any,
      );

      const response = await updateDeclaration(projectId, payload);

      expect(ceMarkingService.updateDeclaration).toHaveBeenCalledWith(
        projectId,
        payload,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("updateRegistration", () => {
    it("should call ceMarkingService.updateRegistration with projectId and data", async () => {
      const projectId = "proj-1";
      const payload = {
        registrationStatus: "registered",
        euRegistrationId: "EU-123",
        registrationDate: "2026-02-26",
        euRecordUrl: "https://eu-record.test/1",
      };
      const mockData = { success: true };
      vi.mocked(ceMarkingService.updateRegistration).mockResolvedValue(
        mockData as any,
      );

      const response = await updateRegistration(projectId, payload);

      expect(ceMarkingService.updateRegistration).toHaveBeenCalledWith(
        projectId,
        payload,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("getAllPolicies", () => {
    it("should call ceMarkingService.getAllPolicies and return result", async () => {
      const mockData = [{ id: 1, name: "Policy A" }];
      vi.mocked(ceMarkingService.getAllPolicies).mockResolvedValue(
        mockData as any,
      );

      const response = await getAllPolicies();

      expect(ceMarkingService.getAllPolicies).toHaveBeenCalledWith();
      expect(response).toEqual(mockData);
    });
  });

  describe("getAllEvidences", () => {
    it("should call ceMarkingService.getAllEvidences and return result", async () => {
      const mockData = [{ id: 10, filename: "evidence.pdf" }];
      vi.mocked(ceMarkingService.getAllEvidences).mockResolvedValue(
        mockData as any,
      );

      const response = await getAllEvidences();

      expect(ceMarkingService.getAllEvidences).toHaveBeenCalledWith();
      expect(response).toEqual(mockData);
    });
  });

  describe("getAllIncidents", () => {
    it("should call ceMarkingService.getAllIncidents and return result", async () => {
      const mockData = [{ id: 20, title: "Incident A" }];
      vi.mocked(ceMarkingService.getAllIncidents).mockResolvedValue(
        mockData as any,
      );

      const response = await getAllIncidents();

      expect(ceMarkingService.getAllIncidents).toHaveBeenCalledWith();
      expect(response).toEqual(mockData);
    });
  });

  describe("updateLinkedPolicies", () => {
    it("should call ceMarkingService.updateLinkedPolicies with projectId and policyIds", async () => {
      const projectId = "proj-1";
      const policyIds = [1, 2, 3];
      const mockData = { success: true };
      vi.mocked(ceMarkingService.updateLinkedPolicies).mockResolvedValue(
        mockData as any,
      );

      const response = await updateLinkedPolicies(projectId, policyIds);

      expect(ceMarkingService.updateLinkedPolicies).toHaveBeenCalledWith(
        projectId,
        policyIds,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("updateLinkedEvidences", () => {
    it("should call ceMarkingService.updateLinkedEvidences with projectId and evidenceIds", async () => {
      const projectId = "proj-1";
      const evidenceIds = [11, 12];
      const mockData = { success: true };
      vi.mocked(ceMarkingService.updateLinkedEvidences).mockResolvedValue(
        mockData as any,
      );

      const response = await updateLinkedEvidences(projectId, evidenceIds);

      expect(ceMarkingService.updateLinkedEvidences).toHaveBeenCalledWith(
        projectId,
        evidenceIds,
      );
      expect(response).toEqual(mockData);
    });
  });

  describe("updateLinkedIncidents", () => {
    it("should call ceMarkingService.updateLinkedIncidents with projectId and incidentIds", async () => {
      const projectId = "proj-1";
      const incidentIds = [21, 22];
      const mockData = { success: true };
      vi.mocked(ceMarkingService.updateLinkedIncidents).mockResolvedValue(
        mockData as any,
      );

      const response = await updateLinkedIncidents(projectId, incidentIds);

      expect(ceMarkingService.updateLinkedIncidents).toHaveBeenCalledWith(
        projectId,
        incidentIds,
      );
      expect(response).toEqual(mockData);
    });
  });
});
