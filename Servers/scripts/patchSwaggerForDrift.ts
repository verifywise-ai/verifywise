import YAML from "yamljs";
import fs from "fs";
import path from "path";

const SWAGGER_PATH = path.resolve(__dirname, "../swagger.yaml");
const swagger = YAML.load(SWAGGER_PATH) as any;

// Nullable fields in the project risk response that the DB allows to be NULL.
const nullableProjectRiskFields = [
  "ai_lifecycle_phase",
  "risk_description",
  "impact",
  "assessment_mapping",
  "controls_mapping",
  "likelihood",
  "severity",
  "risk_level_autocalculated",
  "review_notes",
  "mitigation_status",
  "current_risk_level",
  "deadline",
  "mitigation_plan",
  "implementation_strategy",
  "mitigation_evidence_document",
  "likelihood_mitigation",
  "risk_severity",
  "final_risk_level",
  "risk_approval",
  "approval_status",
  "date_of_assessment",
];

const input = swagger.components.schemas.ProjectRiskInput;
if (input && input.properties) {
  // Fix current_risk_level enum to match the canonical lowercase "risk" casing
  // used by the risk calculation utilities.
  if (input.properties.current_risk_level) {
    input.properties.current_risk_level.enum = [
      "No risk",
      "Very low risk",
      "Low risk",
      "Medium risk",
      "High risk",
      "Very high risk",
    ];
  }

  for (const field of nullableProjectRiskFields) {
    if (input.properties[field]) {
      input.properties[field].nullable = true;
      if (Array.isArray(input.properties[field].enum)) {
        if (!input.properties[field].enum.includes(null)) {
          input.properties[field].enum.push(null);
        }
      }
    }
  }
}

const response = swagger.components.schemas.ProjectRiskResponse;
if (response && response.allOf && response.allOf[1]) {
  const extra = response.allOf[1].properties || (response.allOf[1].properties = {});
  extra.organization_id = { type: "integer", nullable: true };
  extra.is_deleted = { type: "boolean" };
  extra.deleted_at = { type: "string", format: "date-time", nullable: true };
  extra.custom_fields = {
    type: "array",
    items: { type: "object" },
  };
}

fs.writeFileSync(SWAGGER_PATH, YAML.stringify(swagger, 10, 2));
console.log("Patched swagger.yaml for known response drift.");
