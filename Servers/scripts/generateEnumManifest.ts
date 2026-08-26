import fs from "fs";
import path from "path";

// Backend sources of truth. Keep this list small and high-value; expand it as
// the sentinel proves useful.
import { AiRiskClassification } from "../domain.layer/enums/ai-risk-classification.enum";
import { HighRiskRole } from "../domain.layer/enums/high-risk-role.enum";
import { ProjectStatus } from "../domain.layer/enums/project-status.enum";
import { TaskStatus } from "../domain.layer/enums/task-status.enum";
import { TaskPriority } from "../domain.layer/enums/task-priority.enum";
import { DataClassification } from "../domain.layer/enums/data-classification.enum";
import { ModelInventoryStatus } from "../domain.layer/enums/model-inventory-status.enum";

import {
  AI_LIFECYCLE_PHASE_ENUM,
  LIKELIHOOD_ENUM,
  SEVERITY_ENUM,
  RISK_SEVERITY_ENUM,
  MITIGATION_STATUS_ENUM,
} from "../utils/validations/riskValidation.utils";

const MANIFEST_PATH = path.resolve(__dirname, "../enum-manifest.json");

function enumValues<T extends Record<string, string>>(e: T): string[] {
  return Object.values(e).filter((v): v is string => typeof v === "string");
}

function constValues(arr: readonly string[]): string[] {
  return [...arr];
}

// The canonical current-risk-level values used by calculateRiskLevel and
// validateCurrentRiskLevel in riskValidation.utils.ts.
const CURRENT_RISK_LEVEL_VALUES = [
  "No risk",
  "Very low risk",
  "Low risk",
  "Medium risk",
  "High risk",
  "Very high risk",
];

// Auto-calculated risk levels are the same set.
const RISK_LEVEL_AUTOCALCULATED_VALUES = [...CURRENT_RISK_LEVEL_VALUES];

const manifest = {
  aiRiskClassification: enumValues(AiRiskClassification),
  highRiskRole: enumValues(HighRiskRole),
  projectStatus: enumValues(ProjectStatus),
  taskStatus: enumValues(TaskStatus),
  taskPriority: enumValues(TaskPriority),
  dataClassification: enumValues(DataClassification),
  modelInventoryStatus: enumValues(ModelInventoryStatus),
  aiLifecyclePhase: constValues(AI_LIFECYCLE_PHASE_ENUM),
  riskLikelihood: constValues(LIKELIHOOD_ENUM),
  riskSeverity: constValues(SEVERITY_ENUM),
  riskSeverityAlt: constValues(RISK_SEVERITY_ENUM),
  mitigationStatus: constValues(MITIGATION_STATUS_ENUM),
  currentRiskLevel: CURRENT_RISK_LEVEL_VALUES,
  riskLevelAutocalculated: RISK_LEVEL_AUTOCALCULATED_VALUES,
};

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote enum manifest to ${MANIFEST_PATH}`);
process.exit(0);
