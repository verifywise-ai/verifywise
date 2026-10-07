/**
 * Incident management demo seeder — creates 8 realistic AI incidents through
 * the real HTTP API (POST /api/ai-incident-managements), so validation,
 * change history and "incident_added" automations behave exactly as in the UI.
 *
 * Auth (never hardcoded; pick one):
 *   AUTH_TOKEN=<jwt>                          an access token for the target org
 *   SEED_EMAIL=<email> SEED_PASSWORD=<pw>     logs in via POST /api/users/login
 * The incidents land in the org of the authenticated user.
 *
 * Idempotent: incidents whose description already exists in the org are
 * skipped, so reruns add nothing.
 *
 * LOCAL / DEMO ONLY. Requires the backend to be running.
 *
 * Usage (from Servers/):
 *   SEED_EMAIL=admin@example.com SEED_PASSWORD=... npm run seed:incidents
 *   npm run seed:incidents -- --json    # print the payloads, write nothing
 *
 * Env:
 *   API_BASE_URL   (default http://localhost:3000/api)
 */

import {
  AIIncidentManagementApprovalStatus,
  AIIncidentManagementStatus,
  IncidentType,
  Severity,
} from "../../domain.layer/enums/ai-incident-management.enum";

// categories_of_harm values the API accepts (see the frontend HarmCategory enum).
const HARM = {
  HEALTH: "Health",
  SAFETY: "Safety",
  RIGHTS: "Rights",
  PROPERTY: "Property",
  ENVIRONMENT: "Environment",
} as const;

interface SeedIncident {
  incident_id: string;
  ai_project: string;
  type: IncidentType;
  severity: Severity;
  status: AIIncidentManagementStatus;
  occurred_date: string;
  date_detected: string;
  reporter: string;
  categories_of_harm: string[];
  affected_persons_groups?: string;
  description: string;
  relationship_causality?: string;
  immediate_mitigations?: string;
  planned_corrective_actions?: string;
  model_system_version?: string;
  interim_report: boolean;
  approval_status: AIIncidentManagementApprovalStatus;
  approved_by?: string;
  approval_date?: string;
  approval_notes?: string;
  archived: boolean;
}

const DEMO_INCIDENTS: SeedIncident[] = [
  {
    incident_id: "INC-2024-001",
    ai_project: "Customer Support Chatbot v2.1",
    type: IncidentType.UNEXPECTED_BEHAVIOR,
    severity: Severity.SERIOUS,
    status: AIIncidentManagementStatus.MITIGATED,
    occurred_date: "2024-01-15",
    date_detected: "2024-01-16",
    reporter: "Sarah Johnson",
    categories_of_harm: [HARM.RIGHTS, HARM.PROPERTY],
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
    status: AIIncidentManagementStatus.INVESTIGATING,
    occurred_date: "2024-02-03",
    date_detected: "2024-02-10",
    reporter: "David Martinez",
    categories_of_harm: [HARM.RIGHTS],
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
    status: AIIncidentManagementStatus.OPEN,
    occurred_date: "2024-03-12",
    date_detected: "2024-03-14",
    reporter: "Jennifer Lee",
    categories_of_harm: [HARM.SAFETY, HARM.PROPERTY],
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
    status: AIIncidentManagementStatus.CLOSED,
    occurred_date: "2024-01-28",
    date_detected: "2024-01-28",
    reporter: "Alex Thompson",
    categories_of_harm: [HARM.RIGHTS],
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
    status: AIIncidentManagementStatus.INVESTIGATING,
    occurred_date: "2024-02-20",
    date_detected: "2024-02-21",
    reporter: "Dr. Robert Kim",
    categories_of_harm: [HARM.HEALTH, HARM.RIGHTS],
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
    status: AIIncidentManagementStatus.MITIGATED,
    occurred_date: "2024-03-05",
    date_detected: "2024-03-05",
    reporter: "Carlos Mendez",
    categories_of_harm: [HARM.SAFETY, HARM.ENVIRONMENT],
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
    status: AIIncidentManagementStatus.CLOSED,
    occurred_date: "2024-01-10",
    date_detected: "2024-01-12",
    reporter: "Lisa Wang",
    categories_of_harm: [HARM.PROPERTY],
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
    status: AIIncidentManagementStatus.INVESTIGATING,
    occurred_date: "2024-02-28",
    date_detected: "2024-02-28",
    reporter: "James Patterson",
    categories_of_harm: [HARM.SAFETY],
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

const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:3000/api").replace(/\/$/, "");

async function getToken(): Promise<string> {
  if (process.env.AUTH_TOKEN) return process.env.AUTH_TOKEN;
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "No credentials. Set AUTH_TOKEN, or SEED_EMAIL and SEED_PASSWORD for a user in the target org.",
    );
  }
  const res = await fetch(`${API_BASE_URL}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => undefined)) as
    { data?: { token?: string } } | undefined;
  const token = body?.data?.token;
  if (!res.ok || !token) throw new Error(`Login failed for ${email} (HTTP ${res.status}).`);
  return token;
}

async function api(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : undefined;
}

async function main() {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(DEMO_INCIDENTS, null, 2));
    return;
  }

  console.log(`Seeding ${DEMO_INCIDENTS.length} demo incidents via ${API_BASE_URL}`);
  const token = await getToken();

  const existing = await api(token, "GET", "/ai-incident-managements");
  const rows: Array<{ description?: string }> = Array.isArray(existing?.data)
    ? existing.data
    : (existing?.data?.data ?? existing?.data?.rows ?? []);
  const existingDescriptions = new Set(rows.map((r) => r.description));

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const incident of DEMO_INCIDENTS) {
    if (existingDescriptions.has(incident.description)) {
      skipped++;
      console.log(`  skip    ${incident.ai_project} (already exists)`);
      continue;
    }
    try {
      await api(token, "POST", "/ai-incident-managements", incident);
      created++;
      console.log(`  created ${incident.ai_project} [${incident.severity}, ${incident.status}]`);
    } catch (err) {
      failed++;
      console.error(`  FAILED  ${incident.ai_project}: ${(err as Error).message}`);
    }
  }
  console.log(`Done: ${created} created, ${skipped} already present, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[seed:incidents] FAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
