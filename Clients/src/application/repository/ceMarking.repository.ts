/**
 * CE Marking Repository
 *
 * Application layer wrapper for CE Marking infrastructure services.
 * Provides a unified API for the presentation layer to access CE Marking functionality.
 *
 * @module application/repository/ceMarking
 */

import { ceMarkingService } from "../../infrastructure/api/ceMarkingService";
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
