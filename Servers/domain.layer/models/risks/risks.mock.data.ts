import { IRisk } from "../../interfaces/I.risk";

// Helper functions to create dynamic dates for testing
const createPastDate = (daysAgo: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const createFutureDate = (daysFromNow: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
};

// Sample mock data for ProjectRisk
const mockProjectRisks = (_projectId1: number, userId1: number, userId2: number): IRisk[] => {
  return [
    // Project risk for the first project
    {
      id: 1,
      risk_name: "Data Privacy Compliance",
      risk_owner: userId1,
      ai_lifecycle_phase: "Monitoring & maintenance",
      risk_description: "Risk of non-compliance with data privacy regulations.",
      risk_category: ["Cybersecurity risk"],
      impact: "High",
      assessment_mapping: "GDPR Compliance Check",
      controls_mapping: "Data Access Controls",
      likelihood: "Possible",
      severity: "Minor",
      risk_level_autocalculated: "Medium risk",
      review_notes: "Need for regular audits.",
      mitigation_status: "Requires review",
      current_risk_level: "Medium risk",
      deadline: createPastDate(30),
      mitigation_plan: "In Progress",
      implementation_strategy: "Anonymize user data in production environments.",
      mitigation_evidence_document: "Data_Anonymization_Plan.pdf",
      likelihood_mitigation: "Almost Certain",
      risk_severity: "Moderate",
      final_risk_level: "Low",
      risk_approval: userId2,
      approval_status: "In Progress",
      date_of_assessment: createPastDate(60),
    },
    {
      id: 2,
      risk_name: "Algorithm Bias",
      risk_owner: userId2,
      ai_lifecycle_phase: "Data collection & processing",
      risk_description: "Potential for biased outcomes in AI predictions.",
      risk_category: ["Technological risk"],
      impact: "Medium",
      assessment_mapping: "Bias Testing Framework",
      controls_mapping: "Diversity Audits",
      likelihood: "Possible",
      severity: "Negligible",
      risk_level_autocalculated: "High risk",
      review_notes: "Regular monitoring required.",
      mitigation_status: "Not Started",
      current_risk_level: "Low risk",
      deadline: createFutureDate(75),
      mitigation_plan: "Introduce fair algorithms.",
      implementation_strategy: "Regularly assess and modify algorithms.",
      mitigation_evidence_document: "Bias_Test_Report.pdf",
      likelihood_mitigation: "Rare",
      risk_severity: "Minor",
      final_risk_level: "Low",
      risk_approval: userId1,
      approval_status: "Completed",
      date_of_assessment: createPastDate(75),
    },
    // Project risk for the second project
  ];
};

// Export the mock data for use in other files
export default mockProjectRisks;
