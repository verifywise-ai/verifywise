// Build replacement dict for incident
export function buildIncidentReplacements(incident: any): Record<string, any> {
  return {
    "incident.ai_project": incident.ai_project || "",
    "incident.type": incident.type || "",
    "incident.severity": incident.severity || "",
    "incident.status": incident.status || "",
    "incident.occurred_date": incident.occurred_date
      ? new Date(incident.occurred_date).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    "incident.date_detected": incident.date_detected
      ? new Date(incident.date_detected).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    "incident.reporter": incident.reporter || "",
    "incident.categories_of_harm": Array.isArray(incident.categories_of_harm)
      ? incident.categories_of_harm.join(", ")
      : "",
    "incident.affected_persons_groups": incident.affected_persons_groups || "",
    "incident.description": incident.description || "",
    "incident.relationship_causality": incident.relationship_causality || "",
    "incident.immediate_mitigations": incident.immediate_mitigations || "",
    "incident.planned_corrective_actions": incident.planned_corrective_actions || "",
    "incident.model_system_version": incident.model_system_version || "",
    "incident.approval_status": incident.approval_status || "",
    "incident.approved_by": incident.approved_by || "",
    "incident.approval_date": incident.approval_date
      ? new Date(incident.approval_date).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    "incident.approval_notes": incident.approval_notes || "",
    "incident.interim_report": incident.interim_report ? "Yes" : "No",
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}

export function buildIncidentUpdateReplacements(
  oldIncident: any,
  newIncident: any,
): Record<string, any> {
  const occurredDate = newIncident.occurred_date
    ? new Date(newIncident.occurred_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldOccurredDate = oldIncident.occurred_date
    ? new Date(oldIncident.occurred_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const dateDetected = newIncident.date_detected
    ? new Date(newIncident.date_detected).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldDateDetected = oldIncident.date_detected
    ? new Date(oldIncident.date_detected).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const approvalDate = newIncident.approval_date
    ? new Date(newIncident.approval_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldApprovalDate = oldIncident.approval_date
    ? new Date(oldIncident.approval_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const categoriesOfHarm = Array.isArray(newIncident.categories_of_harm)
    ? newIncident.categories_of_harm.join(", ")
    : "";
  const oldCategoriesOfHarm = Array.isArray(oldIncident.categories_of_harm)
    ? oldIncident.categories_of_harm.join(", ")
    : "";

  // Build changes summary - only show changed fields with arrow, unchanged fields without arrow
  const changes: string[] = [];

  if (oldIncident.ai_project !== newIncident.ai_project) {
    changes.push(
      `• AI Project: ${oldIncident.ai_project || "(empty)"} → ${newIncident.ai_project || "(empty)"}`,
    );
  } else if (newIncident.ai_project) {
    changes.push(`• AI Project: ${newIncident.ai_project}`);
  }

  if (oldIncident.type !== newIncident.type) {
    changes.push(`• Type: ${oldIncident.type || "(empty)"} → ${newIncident.type || "(empty)"}`);
  } else if (newIncident.type) {
    changes.push(`• Type: ${newIncident.type}`);
  }

  if (oldIncident.severity !== newIncident.severity) {
    changes.push(
      `• Severity: ${oldIncident.severity || "(empty)"} → ${newIncident.severity || "(empty)"}`,
    );
  } else if (newIncident.severity) {
    changes.push(`• Severity: ${newIncident.severity}`);
  }

  if (oldIncident.status !== newIncident.status) {
    changes.push(
      `• Status: ${oldIncident.status || "(empty)"} → ${newIncident.status || "(empty)"}`,
    );
  } else if (newIncident.status) {
    changes.push(`• Status: ${newIncident.status}`);
  }

  if (oldOccurredDate !== occurredDate) {
    changes.push(`• Occurred Date: ${oldOccurredDate || "(empty)"} → ${occurredDate || "(empty)"}`);
  } else if (occurredDate) {
    changes.push(`• Occurred Date: ${occurredDate}`);
  }

  if (oldDateDetected !== dateDetected) {
    changes.push(`• Date Detected: ${oldDateDetected || "(empty)"} → ${dateDetected || "(empty)"}`);
  } else if (dateDetected) {
    changes.push(`• Date Detected: ${dateDetected}`);
  }

  if (oldIncident.reporter !== newIncident.reporter) {
    changes.push(
      `• Reporter: ${oldIncident.reporter || "(empty)"} → ${newIncident.reporter || "(empty)"}`,
    );
  } else if (newIncident.reporter) {
    changes.push(`• Reporter: ${newIncident.reporter}`);
  }

  if (oldCategoriesOfHarm !== categoriesOfHarm) {
    changes.push(
      `• Categories of Harm: ${oldCategoriesOfHarm || "(empty)"} → ${categoriesOfHarm || "(empty)"}`,
    );
  } else if (categoriesOfHarm) {
    changes.push(`• Categories of Harm: ${categoriesOfHarm}`);
  }

  if (oldIncident.affected_persons_groups !== newIncident.affected_persons_groups) {
    changes.push(
      `• Affected Persons/Groups: ${oldIncident.affected_persons_groups || "(empty)"} → ${newIncident.affected_persons_groups || "(empty)"}`,
    );
  } else if (newIncident.affected_persons_groups) {
    changes.push(`• Affected Persons/Groups: ${newIncident.affected_persons_groups}`);
  }

  if (oldIncident.description !== newIncident.description) {
    changes.push(
      `• Description: ${oldIncident.description || "(empty)"} → ${newIncident.description || "(empty)"}`,
    );
  } else if (newIncident.description) {
    changes.push(`• Description: ${newIncident.description}`);
  }

  if (oldIncident.relationship_causality !== newIncident.relationship_causality) {
    changes.push(
      `• Relationship/Causality: ${oldIncident.relationship_causality || "(empty)"} → ${newIncident.relationship_causality || "(empty)"}`,
    );
  } else if (newIncident.relationship_causality) {
    changes.push(`• Relationship/Causality: ${newIncident.relationship_causality}`);
  }

  if (oldIncident.immediate_mitigations !== newIncident.immediate_mitigations) {
    changes.push(
      `• Immediate Mitigations: ${oldIncident.immediate_mitigations || "(empty)"} → ${newIncident.immediate_mitigations || "(empty)"}`,
    );
  } else if (newIncident.immediate_mitigations) {
    changes.push(`• Immediate Mitigations: ${newIncident.immediate_mitigations}`);
  }

  if (oldIncident.planned_corrective_actions !== newIncident.planned_corrective_actions) {
    changes.push(
      `• Planned Corrective Actions: ${oldIncident.planned_corrective_actions || "(empty)"} → ${newIncident.planned_corrective_actions || "(empty)"}`,
    );
  } else if (newIncident.planned_corrective_actions) {
    changes.push(`• Planned Corrective Actions: ${newIncident.planned_corrective_actions}`);
  }

  if (oldIncident.model_system_version !== newIncident.model_system_version) {
    changes.push(
      `• Model/System Version: ${oldIncident.model_system_version || "(empty)"} → ${newIncident.model_system_version || "(empty)"}`,
    );
  } else if (newIncident.model_system_version) {
    changes.push(`• Model/System Version: ${newIncident.model_system_version}`);
  }

  if (oldIncident.approval_status !== newIncident.approval_status) {
    changes.push(
      `• Approval Status: ${oldIncident.approval_status || "(empty)"} → ${newIncident.approval_status || "(empty)"}`,
    );
  } else if (newIncident.approval_status) {
    changes.push(`• Approval Status: ${newIncident.approval_status}`);
  }

  if (oldIncident.approved_by !== newIncident.approved_by) {
    changes.push(
      `• Approved By: ${oldIncident.approved_by || "(empty)"} → ${newIncident.approved_by || "(empty)"}`,
    );
  } else if (newIncident.approved_by) {
    changes.push(`• Approved By: ${newIncident.approved_by}`);
  }

  if (oldApprovalDate !== approvalDate) {
    changes.push(`• Approval Date: ${oldApprovalDate || "(empty)"} → ${approvalDate || "(empty)"}`);
  } else if (approvalDate) {
    changes.push(`• Approval Date: ${approvalDate}`);
  }

  if (oldIncident.approval_notes !== newIncident.approval_notes) {
    changes.push(
      `• Approval Notes: ${oldIncident.approval_notes || "(empty)"} → ${newIncident.approval_notes || "(empty)"}`,
    );
  } else if (newIncident.approval_notes) {
    changes.push(`• Approval Notes: ${newIncident.approval_notes}`);
  }

  const oldInterimReport = oldIncident.interim_report ? "Yes" : "No";
  const newInterimReport = newIncident.interim_report ? "Yes" : "No";
  if (oldInterimReport !== newInterimReport) {
    changes.push(`• Interim Report: ${oldInterimReport} → ${newInterimReport}`);
  } else {
    changes.push(`• Interim Report: ${newInterimReport}`);
  }

  const changesSummary = changes.join("\n");

  return {
    // Current/new incident values
    "incident.ai_project": newIncident.ai_project || "",
    "incident.type": newIncident.type || "",
    "incident.severity": newIncident.severity || "",
    "incident.status": newIncident.status || "",
    "incident.occurred_date": occurredDate,
    "incident.date_detected": dateDetected,
    "incident.reporter": newIncident.reporter || "",
    "incident.categories_of_harm": categoriesOfHarm,
    "incident.affected_persons_groups": newIncident.affected_persons_groups || "",
    "incident.description": newIncident.description || "",
    "incident.relationship_causality": newIncident.relationship_causality || "",
    "incident.immediate_mitigations": newIncident.immediate_mitigations || "",
    "incident.planned_corrective_actions": newIncident.planned_corrective_actions || "",
    "incident.model_system_version": newIncident.model_system_version || "",
    "incident.approval_status": newIncident.approval_status || "",
    "incident.approved_by": newIncident.approved_by || "",
    "incident.approval_date": approvalDate,
    "incident.approval_notes": newIncident.approval_notes || "",
    "incident.interim_report": newInterimReport,

    // Old incident values
    "old_incident.ai_project": oldIncident.ai_project || "",
    "old_incident.type": oldIncident.type || "",
    "old_incident.severity": oldIncident.severity || "",
    "old_incident.status": oldIncident.status || "",
    "old_incident.occurred_date": oldOccurredDate,
    "old_incident.date_detected": oldDateDetected,
    "old_incident.reporter": oldIncident.reporter || "",
    "old_incident.categories_of_harm": oldCategoriesOfHarm,
    "old_incident.affected_persons_groups": oldIncident.affected_persons_groups || "",
    "old_incident.description": oldIncident.description || "",
    "old_incident.relationship_causality": oldIncident.relationship_causality || "",
    "old_incident.immediate_mitigations": oldIncident.immediate_mitigations || "",
    "old_incident.planned_corrective_actions": oldIncident.planned_corrective_actions || "",
    "old_incident.model_system_version": oldIncident.model_system_version || "",
    "old_incident.approval_status": oldIncident.approval_status || "",
    "old_incident.approved_by": oldIncident.approved_by || "",
    "old_incident.approval_date": oldApprovalDate,
    "old_incident.approval_notes": oldIncident.approval_notes || "",
    "old_incident.interim_report": oldInterimReport,

    // Changes summary
    changes_summary: changesSummary,

    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
