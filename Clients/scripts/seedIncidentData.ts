/**
 * Demo Data Seeder for Incident Management
 *
 * This script generates realistic demo incident data for testing and demonstration purposes.
 *
 * Usage:
 *   npm run seed:incidents
 *   or
 *   npx tsx scripts/seedIncidentData.ts
 */

import {
  AIIncidentManagementApprovalStatus,
  IncidentManagementStatus,
  Severity,
  IncidentType,
  HarmCategory,
} from "../src/domain/enums/aiIncidentManagement.enum.ts";
import type { IAIIncidentManagement } from "../src/domain/interfaces/i.incidentManagement.ts";

// Demo incident templates
const demoIncidents: Omit<IAIIncidentManagement, "id" | "created_at" | "updated_at">[] = [
  {
    incident_id: "INC-2024-001",
    ai_project: "Customer Support Chatbot v2.1",
    type: IncidentType.UNEXPECTED_BEHAVIOR,
    severity: Severity.SERIOUS,
    status: IncidentManagementStatus.MITIGATED,
    occurred_date: "2024-01-15",
    date_detected: "2024-01-16",
    reporter: "Sarah Johnson",
    categories_of_harm: [HarmCategory.FUNDAMENTAL_RIGHTS, HarmCategory.PROPERTY],
    affected_persons_groups: "Approximately 150 customers in the EMEA region",
    description:
      "The chatbot provided incorrect financial advice to customers, potentially leading to monetary losses. The model exhibited unexpected behavior when processing complex multi-turn conversations about investment products.",
    relationship_causality:
      "Root cause identified as training data bias towards US financial regulations, causing misinterpretation of EMEA-specific queries.",
    immediate_mitigations:
      "Chatbot temporarily disabled for financial advice queries. All affected customers notified via email. Customer service team briefed to handle escalations.",
    planned_corrective_actions:
      "Retrain model with region-specific financial data. Implement additional guardrails for financial advice. Deploy enhanced monitoring for multi-turn conversations.",
    model_system_version: "v2.1.4",
    interim_report: false,
    approval_status: AIIncidentManagementApprovalStatus.APPROVED,
    approved_by: "Michael Chen",
    approval_date: "2024-01-18",
    approval_notes: "Mitigation plan approved. Prioritize retraining with regional data.",
    archived: false,
  },
  {
    incident_id: "INC-2024-002",
    ai_project: "Resume Screening AI",
    type: IncidentType.MALFUNCTION,
    severity: Severity.VERY_SERIOUS,
    status: IncidentManagementStatus.INVESTIGATED,
    occurred_date: "2024-02-03",
    date_detected: "2024-02-10",
    reporter: "David Martinez",
    categories_of_harm: [HarmCategory.FUNDAMENTAL_RIGHTS],
    affected_persons_groups: "Job applicants from underrepresented demographics",
    description:
      "Bias audit revealed the resume screening model systematically ranked candidates from certain ethnic backgrounds lower, violating fair hiring practices and equal opportunity regulations.",
    relationship_causality:
      "Historical hiring data used for training contained systemic bias. Model learned and amplified discriminatory patterns present in legacy data.",
    immediate_mitigations:
      "Suspended automated resume screening. Reverted to manual review process with trained HR professionals. Legal team consulted regarding regulatory implications.",
    planned_corrective_actions:
      "Comprehensive bias testing framework implementation. Data sanitization to remove demographic indicators. Fairness constraints integration in model training. Third-party fairness audit scheduled.",
    model_system_version: "v1.8.2",
    interim_report: true,
    approval_status: AIIncidentManagementApprovalStatus.PENDING,
    approved_by: "",
    approval_notes: "",
    archived: false,
  },
  {
    incident_id: "INC-2024-003",
    ai_project: "Predictive Maintenance System",
    type: IncidentType.MODEL_DRIFT,
    severity: Severity.SERIOUS,
    status: IncidentManagementStatus.OPEN,
    occurred_date: "2024-03-12",
    date_detected: "2024-03-14",
    reporter: "Jennifer Lee",
    categories_of_harm: [HarmCategory.SAFETY, HarmCategory.PROPERTY],
    affected_persons_groups:
      "Factory workers and equipment operators at 3 manufacturing facilities",
    description:
      "Model drift detected in predictive maintenance AI resulted in failure to predict critical equipment failures. Two near-miss safety incidents and one equipment damage event recorded.",
    relationship_causality:
      "Equipment sensor calibration changes and introduction of new machinery types not represented in training data caused distribution shift.",
    immediate_mitigations:
      "Increased manual inspection frequency. Lowered prediction confidence threshold to favor false positives. Alert system recalibrated for higher sensitivity.",
    planned_corrective_actions:
      "Implement continuous monitoring for data drift. Establish automated model retraining pipeline. Deploy ensemble approach with multiple drift detection methods.",
    model_system_version: "v3.2.1",
    interim_report: false,
    approval_status: AIIncidentManagementApprovalStatus.NOT_REQUIRED,
    approved_by: "",
    approval_notes: "",
    archived: false,
  },
  {
    incident_id: "INC-2024-004",
    ai_project: "Content Moderation AI",
    type: IncidentType.MISUSE,
    severity: Severity.MINOR,
    status: IncidentManagementStatus.CLOSED,
    occurred_date: "2024-01-28",
    date_detected: "2024-01-28",
    reporter: "Alex Thompson",
    categories_of_harm: [HarmCategory.FUNDAMENTAL_RIGHTS],
    affected_persons_groups: "Small number of content creators (estimated 20-30 users)",
    description:
      "Adversarial users discovered technique to bypass content moderation filters through strategic character substitution, allowing policy-violating content to remain visible temporarily.",
    relationship_causality:
      "Character-level perturbations not adequately covered in adversarial training dataset.",
    immediate_mitigations:
      "Pattern detection rules added to flag suspicious character patterns. Flagged content manually reviewed and removed within 2 hours of detection.",
    planned_corrective_actions:
      "Expand adversarial training dataset with character substitution patterns. Implement character normalization preprocessing step.",
    model_system_version: "v4.1.0",
    interim_report: false,
    approval_status: AIIncidentManagementApprovalStatus.APPROVED,
    approved_by: "Priya Patel",
    approval_date: "2024-01-30",
    approval_notes: "Low severity incident. Corrective actions proportionate and adequate.",
    archived: false,
  },
  {
    incident_id: "INC-2024-005",
    ai_project: "Medical Diagnosis Assistant",
    type: IncidentType.SECURITY_BREACH,
    severity: Severity.VERY_SERIOUS,
    status: IncidentManagementStatus.INVESTIGATED,
    occurred_date: "2024-02-20",
    date_detected: "2024-02-21",
    reporter: "Dr. Robert Kim",
    categories_of_harm: [HarmCategory.HEALTH, HarmCategory.FUNDAMENTAL_RIGHTS],
    affected_persons_groups: "Patient data potentially accessed: approximately 500 records",
    description:
      "Prompt injection attack exploited model vulnerability to extract training data containing patient information. Security researcher responsibly disclosed the vulnerability.",
    relationship_causality:
      "Insufficient input sanitization and lack of output filtering allowed extraction of memorized training examples containing PII.",
    immediate_mitigations:
      "Model immediately taken offline. Affected patients notified per GDPR/HIPAA requirements. Security incident response team activated. Data protection authority notification filed.",
    planned_corrective_actions:
      "Implement robust input validation and output sanitization. Deploy differential privacy techniques in training. Conduct comprehensive penetration testing. Establish bug bounty program.",
    model_system_version: "v2.0.3",
    interim_report: true,
    approval_status: AIIncidentManagementApprovalStatus.APPROVED,
    approved_by: "Dr. Emily Rodriguez",
    approval_date: "2024-02-22",
    approval_notes:
      "Critical severity. Full investigation required. Regulatory compliance team engaged.",
    archived: false,
  },
  {
    incident_id: "INC-2024-006",
    ai_project: "Smart Traffic Management",
    type: IncidentType.PERFORMANCE_DEGRADATION,
    severity: Severity.SERIOUS,
    status: IncidentManagementStatus.MITIGATED,
    occurred_date: "2024-03-05",
    date_detected: "2024-03-05",
    reporter: "Carlos Mendez",
    categories_of_harm: [HarmCategory.SAFETY, HarmCategory.ENVIRONMENT],
    affected_persons_groups: "Commuters in downtown district (approximately 50,000 daily users)",
    description:
      "Traffic signal optimization algorithm failed during peak hours, causing 40% increase in congestion and elevated vehicle emissions. System performance degraded after software update.",
    relationship_causality:
      "Incompatibility between new traffic sensor firmware and ML inference engine. Sensor data format mismatch caused prediction failures.",
    immediate_mitigations:
      "Rolled back to previous stable version. Manual traffic management activated. Emergency coordination with city traffic control.",
    planned_corrective_actions:
      "Implement comprehensive integration testing for sensor updates. Deploy automated rollback mechanisms. Establish real-time performance monitoring with automatic failover.",
    model_system_version: "v5.3.0",
    interim_report: false,
    approval_status: AIIncidentManagementApprovalStatus.APPROVED,
    approved_by: "Maria Santos",
    approval_date: "2024-03-06",
    approval_notes:
      "Mitigation successful. Require stricter testing protocols for infrastructure updates.",
    archived: false,
  },
  {
    incident_id: "INC-2024-007",
    ai_project: "Fraud Detection System",
    type: IncidentType.DATA_CORRUPTION,
    severity: Severity.MINOR,
    status: IncidentManagementStatus.CLOSED,
    occurred_date: "2024-01-10",
    date_detected: "2024-01-12",
    reporter: "Lisa Wang",
    categories_of_harm: [HarmCategory.PROPERTY],
    affected_persons_groups: "Small business customers (12 accounts)",
    description:
      "Data corruption in transaction logs caused false positive fraud alerts for legitimate business transactions, temporarily blocking valid payments.",
    relationship_causality:
      "Database migration script introduced encoding errors in transaction descriptions. Model misclassified corrupted text as suspicious patterns.",
    immediate_mitigations:
      "Affected transactions manually reviewed and approved. Customers contacted with apologies. Temporary whitelist applied for affected accounts.",
    planned_corrective_actions:
      "Enhanced data validation in ETL pipeline. Implement data quality monitoring. Add corruption detection preprocessing step.",
    model_system_version: "v6.2.1",
    interim_report: false,
    approval_status: AIIncidentManagementApprovalStatus.APPROVED,
    approved_by: "Thomas Brown",
    approval_date: "2024-01-15",
    approval_notes: "Minor incident with quick resolution. Preventive measures adequate.",
    archived: false,
  },
  {
    incident_id: "INC-2024-008",
    ai_project: "Autonomous Warehouse Robots",
    type: IncidentType.MALFUNCTION,
    severity: Severity.SERIOUS,
    status: IncidentManagementStatus.INVESTIGATED,
    occurred_date: "2024-02-28",
    date_detected: "2024-02-28",
    reporter: "James Patterson",
    categories_of_harm: [HarmCategory.SAFETY],
    affected_persons_groups: "Warehouse personnel (15 workers in affected zone)",
    description:
      "Navigation system malfunction caused robot to deviate from designated pathways, creating collision risk with warehouse staff. Emergency stop activated by safety observer.",
    relationship_causality:
      "Edge case in obstacle avoidance algorithm triggered when reflective surfaces and bright lighting conditions combined.",
    immediate_mitigations:
      "Affected robots taken offline. Safety zone perimeters expanded. Additional safety observers deployed. Incident area restricted pending investigation.",
    planned_corrective_actions:
      "Update sensor fusion algorithm to handle reflective surfaces. Enhance testing suite with diverse lighting conditions. Install additional safety sensors.",
    model_system_version: "v1.5.7",
    interim_report: true,
    approval_status: AIIncidentManagementApprovalStatus.PENDING,
    approved_by: "",
    approval_notes: "",
    archived: false,
  },
];

/**
 * Formats and displays incident data for review
 */
function displayIncidents(
  incidents: Omit<IAIIncidentManagement, "id" | "created_at" | "updated_at">[],
) {
  console.log("\n📋 Demo Incident Data Generated\n");
  console.log("═".repeat(80));

  incidents.forEach((incident, index) => {
    console.log(`\n🔸 Incident ${index + 1}:`);
    console.log(`   ID: ${incident.incident_id}`);
    console.log(`   Project: ${incident.ai_project}`);
    console.log(`   Type: ${incident.type}`);
    console.log(`   Severity: ${incident.severity}`);
    console.log(`   Status: ${incident.status}`);
    console.log(`   Approval: ${incident.approval_status}`);
    console.log(`   Harm Categories: ${incident.categories_of_harm.join(", ")}`);
  });

  console.log("\n" + "═".repeat(80));
  console.log(`\n✅ Total incidents generated: ${incidents.length}`);
  console.log("\n📊 Statistics:");

  // Calculate statistics
  const severityCount = incidents.reduce(
    (acc, inc) => {
      acc[inc.severity] = (acc[inc.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const statusCount = incidents.reduce(
    (acc, inc) => {
      acc[inc.status] = (acc[inc.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(
    `   By Severity: ${JSON.stringify(severityCount, null, 2)
      .replace(/[{}"\n]/g, "")
      .trim()}`,
  );
  console.log(
    `   By Status: ${JSON.stringify(statusCount, null, 2)
      .replace(/[{}"\n]/g, "")
      .trim()}`,
  );
}

/**
 * Exports incident data as JSON for API seeding
 */
function exportAsJSON(
  incidents: Omit<IAIIncidentManagement, "id" | "created_at" | "updated_at">[],
) {
  const jsonOutput = JSON.stringify(incidents, null, 2);
  console.log("\n📄 JSON Export (copy this to use with API):");
  console.log("─".repeat(80));
  console.log(jsonOutput);
  console.log("─".repeat(80));
  return jsonOutput;
}

/**
 * Seeds incidents to the database via API
 */
async function seedToDatabase(
  incidents: Omit<IAIIncidentManagement, "id" | "created_at" | "updated_at">[],
) {
  const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api";
  const AUTH_TOKEN = process.env.AUTH_TOKEN || "";

  console.log("\n🌱 Seeding incidents to database...");
  console.log(`   API: ${API_BASE_URL}/ai-incident-managements`);
  console.log("─".repeat(80));

  let successCount = 0;
  let failCount = 0;

  for (const incident of incidents) {
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (AUTH_TOKEN) {
        headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
      }

      const response = await fetch(`${API_BASE_URL}/ai-incident-managements`, {
        method: "POST",
        headers,
        body: JSON.stringify(incident),
      });

      if (response.ok) {
        await response.json();
        successCount++;
        console.log(`✅ Created: ${incident.incident_id} - ${incident.ai_project}`);
      } else {
        failCount++;
        const errorText = await response.text();
        console.error(
          `❌ Failed: ${incident.incident_id} - Status ${response.status}: ${errorText}`,
        );
      }
    } catch (error) {
      failCount++;
      console.error(
        `❌ Error creating ${incident.incident_id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("─".repeat(80));
  console.log(`\n✅ Successfully created: ${successCount} incidents`);
  if (failCount > 0) {
    console.log(`❌ Failed to create: ${failCount} incidents`);
  }
  console.log("");
}

/**
 * Main execution
 */
async function main() {
  console.log("\n🚀 Incident Management Demo Data Seeder\n");

  displayIncidents(demoIncidents);

  // Check flags
  const shouldExportJSON = process.argv.includes("--json");
  const shouldSeed = process.argv.includes("--seed");

  if (shouldExportJSON) {
    exportAsJSON(demoIncidents);
  }

  if (shouldSeed) {
    await seedToDatabase(demoIncidents);
  }

  console.log("\n💡 Usage Tips:");
  console.log("   • Add --seed flag to insert incidents into database via API");
  console.log("   • Add --json flag to export as JSON format");
  console.log("   • Set AUTH_TOKEN environment variable if authentication is required");
  console.log(
    "   • Set API_BASE_URL environment variable to override default (http://localhost:3000/api)",
  );
  console.log("   • Modify incident templates to fit your specific use cases\n");
}

// Run the seeder (ESM entry point check)
main();

export { demoIncidents };
