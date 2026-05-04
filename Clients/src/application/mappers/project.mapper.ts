/**
 * Project Mapper
 *
 * Maps between Project DTOs (API layer) and Project domain models.
 * Handles data transformation, type conversion, and validation.
 */

import { ProjectModel } from "../../domain/models/Common/project/project.model";
import { Project } from "../../domain/types/Project";
import { ProjectResponseDTO, CreateProjectDTO } from "../dtos/project.dto";
import { AiRiskClassification } from "../../domain/enums/aiRiskClassification.enum";
import { HighRiskRole } from "../../domain/enums/highRiskRole.enum";
import { CreateProjectFormUserModel } from "../../domain/models/Common/user/user.model";

/**
 * Converts API risk classification to domain enum
 */
export function mapRiskClassification(value: number | string): AiRiskClassification {
  if (typeof value === "number") {
    // Map numeric values to enum (assuming 0-3 mapping)
    const numericMapping: Record<number, AiRiskClassification> = {
      0: AiRiskClassification.PROHIBITED,
      1: AiRiskClassification.HIGH_RISK,
      2: AiRiskClassification.LIMITED_RISK,
      3: AiRiskClassification.MINIMAL_RISK,
    };
    return numericMapping[value] || AiRiskClassification.MINIMAL_RISK;
  }
  // Map string values to enum
  const mapping: Record<string, AiRiskClassification> = {
    prohibited: AiRiskClassification.PROHIBITED,
    "high risk": AiRiskClassification.HIGH_RISK,
    "limited risk": AiRiskClassification.LIMITED_RISK,
    "minimal risk": AiRiskClassification.MINIMAL_RISK,
  };
  return mapping[value.toLowerCase()] || AiRiskClassification.MINIMAL_RISK;
}

/**
 * Converts API high risk role to domain enum
 */
export function mapHighRiskRole(value: number | string): HighRiskRole {
  if (typeof value === "number") {
    return value === 1 ? HighRiskRole.PROVIDER : HighRiskRole.DEPLOYER;
  }
  // Legacy values (Distributor, Importer, Product manufacturer,
  // Authorized representative) collapse onto Provider; not_applicable onto
  // Deployer — matches the DB migration's remap.
  const v = value.toLowerCase();
  if (v === "deployer" || v === "not_applicable") return HighRiskRole.DEPLOYER;
  return HighRiskRole.PROVIDER;
}

/**
 * Maps a ProjectResponseDTO to a Project domain type
 *
 * @param dto - Project response DTO from API
 * @returns Project domain type
 */
export function mapProjectResponseDTOToProject(dto: ProjectResponseDTO): Project {
  return {
    id: dto.id,
    uc_id: dto.uc_id,
    project_title: dto.project_title,
    owner: dto.owner,
    members: Array.isArray(dto.members) ? dto.members.map(String) : [],
    start_date: new Date(dto.start_date),
    ai_risk_classification: mapRiskClassification(
      dto.ai_risk_classification,
    ) as unknown as Project["ai_risk_classification"],
    type_of_high_risk_role: mapHighRiskRole(
      dto.type_of_high_risk_role,
    ) as unknown as Project["type_of_high_risk_role"],
    goal: dto.goal,
    last_updated: new Date(dto.last_updated),
    last_updated_by: dto.last_updated_by,
    framework: dto.framework || [],
    monitored_regulations_and_standards: dto.monitored_regulations_and_standards?.map(String) || [],
    geography: dto.geography,
    target_industry: dto.target_industry,
    description: dto.description,
    is_organizational: dto.is_organizational,
    status: dto.status as Project["status"],
    doneSubcontrols: dto.doneSubcontrols,
    totalSubcontrols: dto.totalSubcontrols,
    answeredAssessments: dto.answeredAssessments,
    totalAssessments: dto.totalAssessments,
  };
}

/**
 * Maps a ProjectResponseDTO to a ProjectModel
 *
 * @param dto - Project response DTO from API
 * @returns ProjectModel instance
 */
export function mapProjectResponseDTOToModel(dto: ProjectResponseDTO): ProjectModel {
  const projectData: ProjectModel = {
    id: dto.id,
    uc_id: dto.uc_id,
    project_title: dto.project_title,
    owner: dto.owner,
    start_date: new Date(dto.start_date),
    ai_risk_classification: mapRiskClassification(dto.ai_risk_classification),
    type_of_high_risk_role: mapHighRiskRole(dto.type_of_high_risk_role),
    goal: dto.goal,
    last_updated: new Date(dto.last_updated),
    last_updated_by: dto.last_updated_by,
    is_demo: dto.is_demo,
    created_at: dto.created_at ? new Date(dto.created_at) : undefined,
    is_organizational: dto.is_organizational ?? false,
  };

  return new ProjectModel(projectData);
}

/**
 * Maps an array of ProjectResponseDTOs to Project domain types
 *
 * @param dtos - Array of project response DTOs
 * @returns Array of Project domain types
 */
export function mapProjectResponseDTOsToProjects(dtos: ProjectResponseDTO[]): Project[] {
  return dtos.map(mapProjectResponseDTOToProject);
}

/**
 * Maps an array of ProjectResponseDTOs to ProjectModel instances
 *
 * @param dtos - Array of project response DTOs
 * @returns Array of ProjectModel instances
 */
export function mapProjectResponseDTOsToModels(dtos: ProjectResponseDTO[]): ProjectModel[] {
  return dtos.map(mapProjectResponseDTOToModel);
}

/**
 * Maps CreateProjectFormValues to CreateProjectDTO
 *
 * @param formValues - Form values from presentation layer
 * @returns CreateProjectDTO
 */
export function mapCreateProjectFormToDTO(formValues: {
  project_title: string;
  owner: number;
  members: CreateProjectFormUserModel[];
  start_date: string;
  ai_risk_classification: number;
  type_of_high_risk_role: number;
  goal: string;
}): CreateProjectDTO {
  return {
    project_title: formValues.project_title,
    owner: formValues.owner,
    members: formValues.members.map((m) => ({
      _id: m._id,
      name: m.name,
      surname: m.surname,
      email: m.email,
    })),
    start_date: formValues.start_date,
    ai_risk_classification: formValues.ai_risk_classification,
    type_of_high_risk_role: formValues.type_of_high_risk_role,
    goal: formValues.goal,
  };
}
