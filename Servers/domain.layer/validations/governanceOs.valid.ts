import { stringValidation, enumValidation } from "./string.valid";
import {
  IGovernanceControlMappingAttributes,
  IGovernanceScenarioAttributes,
  IRecommendationRequest,
  MappingStrength,
  MappingDirection,
} from "../interfaces/i.governanceOs";

const VALID_MAPPING_STRENGTHS: MappingStrength[] = ["direct", "partial", "related"];
const VALID_MAPPING_DIRECTIONS: MappingDirection[] = ["forward", "backward", "bidirectional"];
const VALID_INDUSTRIES = [
  "healthcare",
  "finance",
  "public_sector",
  "technology",
  "manufacturing",
  "education",
  "energy",
  "retail",
  "transportation",
];
const VALID_REGIONS = ["eu", "us", "global", "apac", "uk", "mena"];
const VALID_USE_CASE_TYPES = ["high_risk_ai", "general_purpose_ai", "limited_risk"];

export function validateMappingInput(
  data: Partial<IGovernanceControlMappingAttributes>,
  isUpdate = false,
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!isUpdate && !data.source_framework_id) {
    errors.push("source_framework_id is required");
  }
  if (!isUpdate && !data.target_framework_id) {
    errors.push("target_framework_id is required");
  }
  if (!isUpdate && !stringValidation(data.source_control_type, 1, 50)) {
    errors.push("source_control_type is required (1-50 chars)");
  }
  if (!isUpdate && !stringValidation(data.source_control_identifier, 1, 100)) {
    errors.push("source_control_identifier is required (1-100 chars)");
  }
  if (!isUpdate && !stringValidation(data.target_control_type, 1, 50)) {
    errors.push("target_control_type is required (1-50 chars)");
  }
  if (!isUpdate && !stringValidation(data.target_control_identifier, 1, 100)) {
    errors.push("target_control_identifier is required (1-100 chars)");
  }
  if (data.mapping_strength && !enumValidation(data.mapping_strength, VALID_MAPPING_STRENGTHS)) {
    errors.push(`mapping_strength must be one of: ${VALID_MAPPING_STRENGTHS.join(", ")}`);
  }
  if (data.mapping_direction && !enumValidation(data.mapping_direction, VALID_MAPPING_DIRECTIONS)) {
    errors.push(`mapping_direction must be one of: ${VALID_MAPPING_DIRECTIONS.join(", ")}`);
  }
  if (
    data.confidence_score !== undefined &&
    (data.confidence_score < 0 || data.confidence_score > 1)
  ) {
    errors.push("confidence_score must be between 0.00 and 1.00");
  }

  return { valid: errors.length === 0, errors };
}

export function validateScenarioInput(data: Partial<IGovernanceScenarioAttributes>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!stringValidation(data.name, 1, 255)) {
    errors.push("name is required (1-255 chars)");
  }
  if (data.industry && !enumValidation(data.industry, VALID_INDUSTRIES)) {
    errors.push(`industry must be one of: ${VALID_INDUSTRIES.join(", ")}`);
  }
  if (data.region && !enumValidation(data.region, VALID_REGIONS)) {
    errors.push(`region must be one of: ${VALID_REGIONS.join(", ")}`);
  }
  if (data.use_case_type && !enumValidation(data.use_case_type, VALID_USE_CASE_TYPES)) {
    errors.push(`use_case_type must be one of: ${VALID_USE_CASE_TYPES.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateRecommendationInput(data: IRecommendationRequest): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.industry && !data.region && !data.riskLevel && !data.useCaseType) {
    errors.push("At least one of industry, region, riskLevel, or useCaseType is required");
  }
  if (data.industry && !enumValidation(data.industry, VALID_INDUSTRIES)) {
    errors.push(`industry must be one of: ${VALID_INDUSTRIES.join(", ")}`);
  }
  if (data.region && !enumValidation(data.region, VALID_REGIONS)) {
    errors.push(`region must be one of: ${VALID_REGIONS.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
