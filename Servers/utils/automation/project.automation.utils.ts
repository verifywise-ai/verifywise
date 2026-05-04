// Build replacement dict for project
export function buildProjectReplacements(project: any): Record<string, any> {
  return {
    "project.id": project.id,
    "project.title": project.project_title,
    "project.goal": project.goal,
    "project.owner": project.owner_name || project.owner,
    "project.start_date": project.start_date
      ? new Date(project.start_date).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    "project.ai_risk_classification": project.ai_risk_classification,
    "project.type_of_high_risk_role": project.type_of_high_risk_role,
    "project.status": project.status,
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}

export function buildProjectUpdateReplacements(
  oldProject: any,
  newProject: any,
): Record<string, any> {
  const startDate = newProject.start_date
    ? new Date(newProject.start_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldStartDate = oldProject.start_date
    ? new Date(oldProject.start_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";

  // Build changes summary - only show changed fields with arrow, unchanged fields without arrow
  const changes: string[] = [];

  if (oldProject.project_title !== newProject.project_title) {
    changes.push(
      `• Title: ${oldProject.project_title || "(empty)"} → ${newProject.project_title || "(empty)"}`,
    );
  } else if (newProject.project_title) {
    changes.push(`• Title: ${newProject.project_title}`);
  }

  if (oldProject.goal !== newProject.goal) {
    changes.push(`• Goal: ${oldProject.goal || "(empty)"} → ${newProject.goal || "(empty)"}`);
  } else if (newProject.goal) {
    changes.push(`• Goal: ${newProject.goal}`);
  }

  const oldOwner = oldProject.owner_name || oldProject.owner;
  const newOwner = newProject.owner_name || newProject.owner;
  if (oldOwner !== newOwner) {
    changes.push(`• Owner: ${oldOwner || "(empty)"} → ${newOwner || "(empty)"}`);
  } else if (newOwner) {
    changes.push(`• Owner: ${newOwner}`);
  }

  if (oldStartDate !== startDate) {
    changes.push(`• Start Date: ${oldStartDate || "(empty)"} → ${startDate || "(empty)"}`);
  } else if (startDate) {
    changes.push(`• Start Date: ${startDate}`);
  }

  if (oldProject.ai_risk_classification !== newProject.ai_risk_classification) {
    changes.push(
      `• AI Risk Classification: ${oldProject.ai_risk_classification || "(empty)"} → ${newProject.ai_risk_classification || "(empty)"}`,
    );
  } else if (newProject.ai_risk_classification) {
    changes.push(`• AI Risk Classification: ${newProject.ai_risk_classification}`);
  }

  if (oldProject.type_of_high_risk_role !== newProject.type_of_high_risk_role) {
    changes.push(
      `• Type of High-Risk Role: ${oldProject.type_of_high_risk_role || "(empty)"} → ${newProject.type_of_high_risk_role || "(empty)"}`,
    );
  } else if (newProject.type_of_high_risk_role) {
    changes.push(`• Type of High-Risk Role: ${newProject.type_of_high_risk_role}`);
  }

  if (oldProject.status !== newProject.status) {
    changes.push(`• Status: ${oldProject.status || "(empty)"} → ${newProject.status || "(empty)"}`);
  } else if (newProject.status) {
    changes.push(`• Status: ${newProject.status}`);
  }

  const changesSummary = changes.join("\n");

  return {
    // Current/new project values
    "project.id": newProject.id,
    "project.title": newProject.project_title,
    "project.goal": newProject.goal,
    "project.owner": newOwner,
    "project.start_date": startDate,
    "project.ai_risk_classification": newProject.ai_risk_classification,
    "project.type_of_high_risk_role": newProject.type_of_high_risk_role,
    "project.status": newProject.status,

    // Old project values
    "old_project.id": oldProject.id,
    "old_project.title": oldProject.project_title,
    "old_project.goal": oldProject.goal,
    "old_project.owner": oldOwner,
    "old_project.start_date": oldStartDate,
    "old_project.ai_risk_classification": oldProject.ai_risk_classification,
    "old_project.type_of_high_risk_role": oldProject.type_of_high_risk_role,
    "old_project.status": oldProject.status,

    // Changes summary
    changes_summary: changesSummary,

    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
