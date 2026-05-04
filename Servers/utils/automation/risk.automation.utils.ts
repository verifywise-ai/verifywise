// Build replacement dict for risk
export function buildRiskReplacements(risk: any): Record<string, any> {
  return {
    "risk.id": risk.id,
    "risk.name": risk.risk_name,
    "risk.description": risk.risk_description || "",
    "risk.owner": risk.owner_name || risk.risk_owner,
    "risk.ai_lifecycle_phase": risk.ai_lifecycle_phase || "",
    "risk.category": Array.isArray(risk.risk_category) ? risk.risk_category.join(", ") : "",
    "risk.impact": risk.impact || "",
    "risk.assessment_mapping": risk.assessment_mapping || "",
    "risk.controls_mapping": risk.controls_mapping || "",
    "risk.likelihood": risk.likelihood || "",
    "risk.severity": risk.severity || "",
    "risk.risk_level": risk.risk_level_autocalculated || "",
    "risk.review_notes": risk.review_notes || "",
    "risk.mitigation_status": risk.mitigation_status || "",
    "risk.current_risk_level": risk.current_risk_level || "",
    "risk.deadline": risk.deadline
      ? new Date(risk.deadline).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    "risk.mitigation_plan": risk.mitigation_plan || "",
    "risk.implementation_strategy": risk.implementation_strategy || "",
    "risk.mitigation_evidence_document": risk.mitigation_evidence_document || "",
    "risk.likelihood_mitigation": risk.likelihood_mitigation || "",
    "risk.risk_severity": risk.risk_severity || "",
    "risk.final_risk_level": risk.final_risk_level || "",
    "risk.approver": risk.approver_name || risk.risk_approval,
    "risk.approval_status": risk.approval_status || "",
    "risk.date_of_assessment": risk.date_of_assessment
      ? new Date(risk.date_of_assessment).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}

export function buildRiskUpdateReplacements(oldRisk: any, newRisk: any): Record<string, any> {
  const deadline = newRisk.deadline
    ? new Date(newRisk.deadline).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldDeadline = oldRisk.deadline
    ? new Date(oldRisk.deadline).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const dateOfAssessment = newRisk.date_of_assessment
    ? new Date(newRisk.date_of_assessment).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldDateOfAssessment = oldRisk.date_of_assessment
    ? new Date(oldRisk.date_of_assessment).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const category = Array.isArray(newRisk.risk_category) ? newRisk.risk_category.join(", ") : "";
  const oldCategory = Array.isArray(oldRisk.risk_category) ? oldRisk.risk_category.join(", ") : "";

  // Build changes summary - only show changed fields with arrow, unchanged fields without arrow
  const changes: string[] = [];

  if (oldRisk.risk_name !== newRisk.risk_name) {
    changes.push(`• Name: ${oldRisk.risk_name || "(empty)"} → ${newRisk.risk_name || "(empty)"}`);
  } else if (newRisk.risk_name) {
    changes.push(`• Name: ${newRisk.risk_name}`);
  }

  if (oldRisk.risk_description !== newRisk.risk_description) {
    changes.push(
      `• Description: ${oldRisk.risk_description || "(empty)"} → ${newRisk.risk_description || "(empty)"}`,
    );
  } else if (newRisk.risk_description) {
    changes.push(`• Description: ${newRisk.risk_description}`);
  }

  const oldOwner = oldRisk.owner_name || oldRisk.risk_owner;
  const newOwner = newRisk.owner_name || newRisk.risk_owner;
  if (oldOwner !== newOwner) {
    changes.push(`• Owner: ${oldOwner || "(empty)"} → ${newOwner || "(empty)"}`);
  } else if (newOwner) {
    changes.push(`• Owner: ${newOwner}`);
  }

  if (oldRisk.ai_lifecycle_phase !== newRisk.ai_lifecycle_phase) {
    changes.push(
      `• AI Lifecycle Phase: ${oldRisk.ai_lifecycle_phase || "(empty)"} → ${newRisk.ai_lifecycle_phase || "(empty)"}`,
    );
  } else if (newRisk.ai_lifecycle_phase) {
    changes.push(`• AI Lifecycle Phase: ${newRisk.ai_lifecycle_phase}`);
  }

  if (oldCategory !== category) {
    changes.push(`• Category: ${oldCategory || "(empty)"} → ${category || "(empty)"}`);
  } else if (category) {
    changes.push(`• Category: ${category}`);
  }

  if (oldRisk.likelihood !== newRisk.likelihood) {
    changes.push(
      `• Likelihood: ${oldRisk.likelihood || "(empty)"} → ${newRisk.likelihood || "(empty)"}`,
    );
  } else if (newRisk.likelihood) {
    changes.push(`• Likelihood: ${newRisk.likelihood}`);
  }

  if (oldRisk.severity !== newRisk.severity) {
    changes.push(`• Severity: ${oldRisk.severity || "(empty)"} → ${newRisk.severity || "(empty)"}`);
  } else if (newRisk.severity) {
    changes.push(`• Severity: ${newRisk.severity}`);
  }

  if (oldRisk.risk_level_autocalculated !== newRisk.risk_level_autocalculated) {
    changes.push(
      `• Risk Level: ${oldRisk.risk_level_autocalculated || "(empty)"} → ${newRisk.risk_level_autocalculated || "(empty)"}`,
    );
  } else if (newRisk.risk_level_autocalculated) {
    changes.push(`• Risk Level: ${newRisk.risk_level_autocalculated}`);
  }

  if (oldRisk.mitigation_status !== newRisk.mitigation_status) {
    changes.push(
      `• Mitigation Status: ${oldRisk.mitigation_status || "(empty)"} → ${newRisk.mitigation_status || "(empty)"}`,
    );
  } else if (newRisk.mitigation_status) {
    changes.push(`• Mitigation Status: ${newRisk.mitigation_status}`);
  }

  if (oldRisk.current_risk_level !== newRisk.current_risk_level) {
    changes.push(
      `• Current Risk Level: ${oldRisk.current_risk_level || "(empty)"} → ${newRisk.current_risk_level || "(empty)"}`,
    );
  } else if (newRisk.current_risk_level) {
    changes.push(`• Current Risk Level: ${newRisk.current_risk_level}`);
  }

  if (oldDeadline !== deadline) {
    changes.push(`• Deadline: ${oldDeadline || "(empty)"} → ${deadline || "(empty)"}`);
  } else if (deadline) {
    changes.push(`• Deadline: ${deadline}`);
  }

  if (oldRisk.approval_status !== newRisk.approval_status) {
    changes.push(
      `• Approval Status: ${oldRisk.approval_status || "(empty)"} → ${newRisk.approval_status || "(empty)"}`,
    );
  } else if (newRisk.approval_status) {
    changes.push(`• Approval Status: ${newRisk.approval_status}`);
  }

  const changesSummary = changes.join("\n");

  return {
    // Current/new risk values
    "risk.id": newRisk.id,
    "risk.name": newRisk.risk_name,
    "risk.description": newRisk.risk_description || "",
    "risk.owner": newOwner,
    "risk.ai_lifecycle_phase": newRisk.ai_lifecycle_phase || "",
    "risk.category": category,
    "risk.impact": newRisk.impact || "",
    "risk.assessment_mapping": newRisk.assessment_mapping || "",
    "risk.controls_mapping": newRisk.controls_mapping || "",
    "risk.likelihood": newRisk.likelihood || "",
    "risk.severity": newRisk.severity || "",
    "risk.risk_level": newRisk.risk_level_autocalculated || "",
    "risk.review_notes": newRisk.review_notes || "",
    "risk.mitigation_status": newRisk.mitigation_status || "",
    "risk.current_risk_level": newRisk.current_risk_level || "",
    "risk.deadline": deadline,
    "risk.mitigation_plan": newRisk.mitigation_plan || "",
    "risk.implementation_strategy": newRisk.implementation_strategy || "",
    "risk.mitigation_evidence_document": newRisk.mitigation_evidence_document || "",
    "risk.likelihood_mitigation": newRisk.likelihood_mitigation || "",
    "risk.risk_severity": newRisk.risk_severity || "",
    "risk.final_risk_level": newRisk.final_risk_level || "",
    "risk.approver": newRisk.approver_name || newRisk.risk_approval,
    "risk.approval_status": newRisk.approval_status || "",
    "risk.date_of_assessment": dateOfAssessment,

    // Old risk values
    "old_risk.id": oldRisk.id,
    "old_risk.name": oldRisk.risk_name,
    "old_risk.description": oldRisk.risk_description || "",
    "old_risk.owner": oldOwner,
    "old_risk.ai_lifecycle_phase": oldRisk.ai_lifecycle_phase || "",
    "old_risk.category": oldCategory,
    "old_risk.impact": oldRisk.impact || "",
    "old_risk.assessment_mapping": oldRisk.assessment_mapping || "",
    "old_risk.controls_mapping": oldRisk.controls_mapping || "",
    "old_risk.likelihood": oldRisk.likelihood || "",
    "old_risk.severity": oldRisk.severity || "",
    "old_risk.risk_level": oldRisk.risk_level_autocalculated || "",
    "old_risk.review_notes": oldRisk.review_notes || "",
    "old_risk.mitigation_status": oldRisk.mitigation_status || "",
    "old_risk.current_risk_level": oldRisk.current_risk_level || "",
    "old_risk.deadline": oldDeadline,
    "old_risk.mitigation_plan": oldRisk.mitigation_plan || "",
    "old_risk.implementation_strategy": oldRisk.implementation_strategy || "",
    "old_risk.mitigation_evidence_document": oldRisk.mitigation_evidence_document || "",
    "old_risk.likelihood_mitigation": oldRisk.likelihood_mitigation || "",
    "old_risk.risk_severity": oldRisk.risk_severity || "",
    "old_risk.final_risk_level": oldRisk.final_risk_level || "",
    "old_risk.approver": oldRisk.approver_name || oldRisk.risk_approval,
    "old_risk.approval_status": oldRisk.approval_status || "",
    "old_risk.date_of_assessment": oldDateOfAssessment,

    // Changes summary
    changes_summary: changesSummary,

    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
