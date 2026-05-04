// Build replacement dict for model
export function buildModelReplacements(model: any): Record<string, any> {
  return {
    "model.id": model.id,
    "model.provider": model.provider,
    "model.name": model.model,
    "model.version": model.version,
    "model.provider_model": model.provider_model,
    "model.approver": model.approver,
    "model.capabilities": model.capabilities,
    "model.security_assessment": model.security_assessment ? "Yes" : "No",
    "model.status": model.status,
    "model.status_date": model.status_date
      ? new Date(model.status_date).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    "model.reference_link": model.reference_link,
    "model.biases": model.biases,
    "model.limitations": model.limitations,
    "model.hosting_provider": model.hosting_provider,
    "model.security_assessment_data": model.security_assessment_data,
    "model.created_at": model.created_at
      ? new Date(model.created_at).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}

export function buildModelUpdateReplacements(oldModel: any, newModel: any): Record<string, any> {
  const statusDate = newModel.status_date
    ? new Date(newModel.status_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldStatusDate = oldModel.status_date
    ? new Date(oldModel.status_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const createdAt = newModel.created_at
    ? new Date(newModel.created_at).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldCreatedAt = oldModel.created_at
    ? new Date(oldModel.created_at).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";

  // Build changes summary - only show changed fields with arrow, unchanged fields without arrow
  const changes: string[] = [];

  if (oldModel.provider !== newModel.provider) {
    changes.push(
      `• Provider: ${oldModel.provider || "(empty)"} → ${newModel.provider || "(empty)"}`,
    );
  } else if (newModel.provider) {
    changes.push(`• Provider: ${newModel.provider}`);
  }

  if (oldModel.model !== newModel.model) {
    changes.push(`• Name: ${oldModel.model || "(empty)"} → ${newModel.model || "(empty)"}`);
  } else if (newModel.model) {
    changes.push(`• Name: ${newModel.model}`);
  }

  if (oldModel.version !== newModel.version) {
    changes.push(`• Version: ${oldModel.version || "(empty)"} → ${newModel.version || "(empty)"}`);
  } else if (newModel.version) {
    changes.push(`• Version: ${newModel.version}`);
  }

  if (oldModel.provider_model !== newModel.provider_model) {
    changes.push(
      `• Provider Model: ${oldModel.provider_model || "(empty)"} → ${newModel.provider_model || "(empty)"}`,
    );
  } else if (newModel.provider_model) {
    changes.push(`• Provider Model: ${newModel.provider_model}`);
  }

  if (oldModel.approver !== newModel.approver) {
    changes.push(
      `• Approver: ${oldModel.approver || "(empty)"} → ${newModel.approver || "(empty)"}`,
    );
  } else if (newModel.approver) {
    changes.push(`• Approver: ${newModel.approver}`);
  }

  if (oldModel.capabilities !== newModel.capabilities) {
    changes.push(
      `• Capabilities: ${oldModel.capabilities || "(empty)"} → ${newModel.capabilities || "(empty)"}`,
    );
  } else if (newModel.capabilities) {
    changes.push(`• Capabilities: ${newModel.capabilities}`);
  }

  const oldSecurityAssessment = oldModel.security_assessment ? "Yes" : "No";
  const newSecurityAssessment = newModel.security_assessment ? "Yes" : "No";
  if (oldSecurityAssessment !== newSecurityAssessment) {
    changes.push(`• Security Assessment: ${oldSecurityAssessment} → ${newSecurityAssessment}`);
  } else {
    changes.push(`• Security Assessment: ${newSecurityAssessment}`);
  }

  if (oldModel.status !== newModel.status) {
    changes.push(`• Status: ${oldModel.status || "(empty)"} → ${newModel.status || "(empty)"}`);
  } else if (newModel.status) {
    changes.push(`• Status: ${newModel.status}`);
  }

  if (oldStatusDate !== statusDate) {
    changes.push(`• Status Date: ${oldStatusDate || "(empty)"} → ${statusDate || "(empty)"}`);
  } else if (statusDate) {
    changes.push(`• Status Date: ${statusDate}`);
  }

  if (oldModel.reference_link !== newModel.reference_link) {
    changes.push(
      `• Reference Link: ${oldModel.reference_link || "(empty)"} → ${newModel.reference_link || "(empty)"}`,
    );
  } else if (newModel.reference_link) {
    changes.push(`• Reference Link: ${newModel.reference_link}`);
  }

  if (oldModel.biases !== newModel.biases) {
    changes.push(`• Biases: ${oldModel.biases || "(empty)"} → ${newModel.biases || "(empty)"}`);
  } else if (newModel.biases) {
    changes.push(`• Biases: ${newModel.biases}`);
  }

  if (oldModel.limitations !== newModel.limitations) {
    changes.push(
      `• Limitations: ${oldModel.limitations || "(empty)"} → ${newModel.limitations || "(empty)"}`,
    );
  } else if (newModel.limitations) {
    changes.push(`• Limitations: ${newModel.limitations}`);
  }

  if (oldModel.hosting_provider !== newModel.hosting_provider) {
    changes.push(
      `• Hosting Provider: ${oldModel.hosting_provider || "(empty)"} → ${newModel.hosting_provider || "(empty)"}`,
    );
  } else if (newModel.hosting_provider) {
    changes.push(`• Hosting Provider: ${newModel.hosting_provider}`);
  }

  if (oldCreatedAt !== createdAt) {
    changes.push(`• Created At: ${oldCreatedAt || "(empty)"} → ${createdAt || "(empty)"}`);
  } else if (createdAt) {
    changes.push(`• Created At: ${createdAt}`);
  }

  const changesSummary = changes.join("\n");

  return {
    // Current/new model values
    "model.id": newModel.id,
    "model.provider": newModel.provider,
    "model.name": newModel.model,
    "model.version": newModel.version,
    "model.provider_model": newModel.provider_model,
    "model.approver": newModel.approver,
    "model.capabilities": newModel.capabilities,
    "model.security_assessment": newModel.security_assessment ? "Yes" : "No",
    "model.status": newModel.status,
    "model.status_date": statusDate,
    "model.reference_link": newModel.reference_link,
    "model.biases": newModel.biases,
    "model.limitations": newModel.limitations,
    "model.hosting_provider": newModel.hosting_provider,
    "model.security_assessment_data": newModel.security_assessment_data,
    "model.created_at": createdAt,

    // Old model values
    "old_model.id": oldModel.id,
    "old_model.provider": oldModel.provider,
    "old_model.name": oldModel.model,
    "old_model.version": oldModel.version,
    "old_model.provider_model": oldModel.provider_model,
    "old_model.approver": oldModel.approver,
    "old_model.capabilities": oldModel.capabilities,
    "old_model.security_assessment": oldModel.security_assessment ? "Yes" : "No",
    "old_model.status": oldModel.status,
    "old_model.status_date": oldStatusDate,
    "old_model.reference_link": oldModel.reference_link,
    "old_model.biases": oldModel.biases,
    "old_model.limitations": oldModel.limitations,
    "old_model.hosting_provider": oldModel.hosting_provider,
    "old_model.security_assessment_data": oldModel.security_assessment_data,
    "old_model.created_at": oldCreatedAt,

    // Changes summary
    changes_summary: changesSummary,

    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
