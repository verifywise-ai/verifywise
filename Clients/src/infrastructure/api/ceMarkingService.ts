import {
  CEMarkingData,
  ConformityStepsUpdatePayload,
  LinkedResourcesUpdatePayload,
} from "../../domain/types/ceMarking";
import CustomAxios from "./customAxios";

const CE_MARKING_API = `/ce-marking`;

/**
 * CE Marking API Service
 */
export const ceMarkingService = {
  /**
   * Get CE Marking data for a project
   * Creates default record if none exists
   */
  async getCEMarking(projectId: string): Promise<CEMarkingData> {
    const response = await CustomAxios.get<CEMarkingData>(`${CE_MARKING_API}/${projectId}`);
    return response.data;
  },

  /**
   * Update CE Marking data for a project
   */
  async updateCEMarking(projectId: string, data: Partial<CEMarkingData>): Promise<CEMarkingData> {
    const response = await CustomAxios.put<CEMarkingData>(`${CE_MARKING_API}/${projectId}`, data);
    return response.data;
  },

  /**
   * Update a specific conformity step
   * Note: The backend only needs the changed fields, not the entire step
   */
  async updateConformityStep(
    projectId: string,
    stepId: number,
    stepData: {
      description?: string;
      status?: string;
      owner?: string;
      dueDate?: string | null;
      completedDate?: string | null;
    },
  ): Promise<CEMarkingData> {
    // Backend expects a simple object with the step update fields
    // The controller will handle updating the specific step by ID
    const updateData: ConformityStepsUpdatePayload = {
      conformitySteps: [
        {
          id: stepId,
          ...stepData,
        },
      ],
    };

    return await this.updateCEMarking(projectId, updateData as any);
  },

  /**
   * Update classification and scope
   */
  async updateClassificationAndScope(
    projectId: string,
    data: {
      isHighRiskAISystem?: boolean;
      roleInProduct?: string;
      annexIIICategory?: string;
    },
  ): Promise<CEMarkingData> {
    return await this.updateCEMarking(projectId, data);
  },

  /**
   * Update declaration of conformity
   */
  async updateDeclaration(
    projectId: string,
    data: {
      declarationStatus?: string;
      signedOn?: string | null;
      signatory?: string | null;
      declarationDocument?: string | null;
    },
  ): Promise<CEMarkingData> {
    return await this.updateCEMarking(projectId, data);
  },

  /**
   * Update EU registration
   */
  async updateRegistration(
    projectId: string,
    data: {
      registrationStatus?: string;
      euRegistrationId?: string | null;
      registrationDate?: string | null;
      euRecordUrl?: string | null;
    },
  ): Promise<CEMarkingData> {
    return await this.updateCEMarking(projectId, data);
  },

  /**
   * Get all available policies
   */
  async getAllPolicies(): Promise<any[]> {
    const response = await CustomAxios.get("/policies");
    // The policies API returns { message: "OK", data: [...] }
    // Extract the data array from the wrapped response
    if (response.data && response.data.data) {
      return response.data.data;
    }
    // Fallback in case the response format is different
    return Array.isArray(response.data) ? response.data : [];
  },

  /**
   * Get all available evidence/files
   */
  async getAllEvidences(): Promise<any[]> {
    const response = await CustomAxios.get("/files");
    // The files API returns the array directly (not wrapped)
    return Array.isArray(response.data) ? response.data : response.data?.data || [];
  },

  /**
   * Update linked policies
   */
  async updateLinkedPolicies(projectId: string, policyIds: number[]): Promise<CEMarkingData> {
    const updateData: LinkedResourcesUpdatePayload = {
      linkedPolicies: policyIds,
      policiesLinked: policyIds.length,
    };
    return await this.updateCEMarking(projectId, updateData);
  },

  /**
   * Update linked evidence
   */
  async updateLinkedEvidences(projectId: string, evidenceIds: number[]): Promise<CEMarkingData> {
    const updateData: LinkedResourcesUpdatePayload = {
      linkedEvidences: evidenceIds,
      evidenceLinked: evidenceIds.length,
    };
    return await this.updateCEMarking(projectId, updateData);
  },

  /**
   * Get all available incidents
   */
  async getAllIncidents(): Promise<any[]> {
    const response = await CustomAxios.get("/ai-incident-managements");
    // The incidents API returns { message: "OK", data: [...] }
    if (response.data && response.data.data) {
      return response.data.data;
    }
    // Fallback in case the response format is different
    return Array.isArray(response.data) ? response.data : [];
  },

  /**
   * Update linked incidents
   */
  async updateLinkedIncidents(projectId: string, incidentIds: number[]): Promise<CEMarkingData> {
    const updateData: LinkedResourcesUpdatePayload = {
      linkedIncidents: incidentIds,
      totalIncidents: incidentIds.length,
    };
    return await this.updateCEMarking(projectId, updateData);
  },
};
