/**
 * CE Marking Repository
 *
 * Application layer wrapper for CE Marking infrastructure services.
 * Provides a unified API for the presentation layer to access CE Marking functionality.
 *
 * @module application/repository/ceMarking
 */

import {
  ceMarkingService,
  type CEMarkingIncidentOption,
} from "../../infrastructure/api/ceMarkingService";
import type {
  CEMarkingData,
  ConformityStepsUpdatePayload,
  LinkedResourcesUpdatePayload,
} from "../../domain/types/ceMarking";

// Re-export types for presentation layer
export type { CEMarkingData, ConformityStepsUpdatePayload, LinkedResourcesUpdatePayload };

// ==================== CE Marking Data ====================

/**
 * Get CE Marking data for a project
 */
export const getCEMarking = (projectId: string) => ceMarkingService.getCEMarking(projectId);

/**
 * Update CE Marking data for a project
 */
export const updateCEMarking = (projectId: string, data: Partial<CEMarkingData>) =>
  ceMarkingService.updateCEMarking(projectId, data);

// ==================== Conformity Steps ====================

/**
 * Update a specific conformity step
 */
export const updateConformityStep = (
  projectId: string,
  stepId: number,
  stepData: {
    description?: string;
    status?: string;
    owner?: string;
    dueDate?: string | null;
    completedDate?: string | null;
  },
) => ceMarkingService.updateConformityStep(projectId, stepId, stepData);

// ==================== Classification & Scope ====================

/**
 * Update classification and scope
 */
export const updateClassificationAndScope = (
  projectId: string,
  data: {
    isHighRiskAISystem?: boolean;
    roleInProduct?: string;
    annexIIICategory?: string;
  },
) => ceMarkingService.updateClassificationAndScope(projectId, data);

// ==================== Declaration ====================

/**
 * Update declaration of conformity
 */
export const updateDeclaration = (
  projectId: string,
  data: {
    declarationStatus?: string;
    signedOn?: string | null;
    signatory?: string | null;
    declarationDocument?: string | null;
  },
) => ceMarkingService.updateDeclaration(projectId, data);

// ==================== Registration ====================

/**
 * Update EU registration
 */
export const updateRegistration = (
  projectId: string,
  data: {
    registrationStatus?: string;
    euRegistrationId?: string | null;
    registrationDate?: string | null;
    euRecordUrl?: string | null;
  },
) => ceMarkingService.updateRegistration(projectId, data);

// ==================== Linked Resources ====================

/**
 * Get all available policies
 */
export const getAllPolicies = () => ceMarkingService.getAllPolicies();

/**
 * Get all available evidences/files
 */
export const getAllEvidences = () => ceMarkingService.getAllEvidences();

/**
 * Get all available incidents
 */
export const getAllIncidents = () => ceMarkingService.getAllIncidents();

/**
 * The incidents the "Link incidents" picker offers for a use case: its
 * non-archived incidents (by `project_id`, the incident's link to the use
 * case), plus any incident already linked, so it can still be unlinked.
 * Incidents without a use case link are only listed when already linked.
 */
export const filterLinkableIncidents = (
  incidents: CEMarkingIncidentOption[],
  projectId: string | number,
  linkedIncidentIds: number[] = [],
): CEMarkingIncidentOption[] => {
  const useCaseId = Number(projectId);
  return incidents.filter(
    (incident) =>
      linkedIncidentIds.includes(incident.id) ||
      (!incident.archived &&
        incident.project_id != null &&
        Number(incident.project_id) === useCaseId),
  );
};

/** getAllIncidents narrowed by filterLinkableIncidents. */
export const getLinkableIncidents = async (
  projectId: string | number,
  linkedIncidentIds: number[] = [],
): Promise<CEMarkingIncidentOption[]> =>
  filterLinkableIncidents(
    (await ceMarkingService.getAllIncidents()) || [],
    projectId,
    linkedIncidentIds,
  );

/**
 * Update linked policies
 */
export const updateLinkedPolicies = (projectId: string, policyIds: number[]) =>
  ceMarkingService.updateLinkedPolicies(projectId, policyIds);

/**
 * Update linked evidences
 */
export const updateLinkedEvidences = (projectId: string, evidenceIds: number[]) =>
  ceMarkingService.updateLinkedEvidences(projectId, evidenceIds);

/**
 * Update linked incidents
 */
export const updateLinkedIncidents = (projectId: string, incidentIds: number[]) =>
  ceMarkingService.updateLinkedIncidents(projectId, incidentIds);
