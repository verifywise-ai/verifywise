// Build replacement dict for training
export function buildTrainingReplacements(training: any): Record<string, any> {
  return {
    "training.name": training.training_name,
    "training.description": training.description || "",
    "training.duration": training.duration || "",
    "training.provider": training.provider || "",
    "training.department": training.department || "",
    "training.status": training.status || "",
    "training.number_of_people": training.numberOfPeople || training.people || "",
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}

export function buildTrainingUpdateReplacements(
  oldTraining: any,
  newTraining: any,
): Record<string, any> {
  // Build changes summary - only show changed fields with arrow, unchanged fields without arrow
  const changes: string[] = [];

  if (oldTraining.training_name !== newTraining.training_name) {
    changes.push(
      `• Name: ${oldTraining.training_name || "(empty)"} → ${newTraining.training_name || "(empty)"}`,
    );
  } else if (newTraining.training_name) {
    changes.push(`• Name: ${newTraining.training_name}`);
  }

  if (oldTraining.description !== newTraining.description) {
    changes.push(
      `• Description: ${oldTraining.description || "(empty)"} → ${newTraining.description || "(empty)"}`,
    );
  } else if (newTraining.description) {
    changes.push(`• Description: ${newTraining.description}`);
  }

  if (oldTraining.duration !== newTraining.duration) {
    changes.push(
      `• Duration: ${oldTraining.duration || "(empty)"} → ${newTraining.duration || "(empty)"}`,
    );
  } else if (newTraining.duration) {
    changes.push(`• Duration: ${newTraining.duration}`);
  }

  if (oldTraining.provider !== newTraining.provider) {
    changes.push(
      `• Provider: ${oldTraining.provider || "(empty)"} → ${newTraining.provider || "(empty)"}`,
    );
  } else if (newTraining.provider) {
    changes.push(`• Provider: ${newTraining.provider}`);
  }

  if (oldTraining.department !== newTraining.department) {
    changes.push(
      `• Department: ${oldTraining.department || "(empty)"} → ${newTraining.department || "(empty)"}`,
    );
  } else if (newTraining.department) {
    changes.push(`• Department: ${newTraining.department}`);
  }

  if (oldTraining.status !== newTraining.status) {
    changes.push(
      `• Status: ${oldTraining.status || "(empty)"} → ${newTraining.status || "(empty)"}`,
    );
  } else if (newTraining.status) {
    changes.push(`• Status: ${newTraining.status}`);
  }

  const oldNumberOfPeople = oldTraining.numberOfPeople || oldTraining.people || "";
  const newNumberOfPeople = newTraining.numberOfPeople || newTraining.people || "";
  if (oldNumberOfPeople !== newNumberOfPeople) {
    changes.push(
      `• Number of People: ${oldNumberOfPeople || "(empty)"} → ${newNumberOfPeople || "(empty)"}`,
    );
  } else if (newNumberOfPeople) {
    changes.push(`• Number of People: ${newNumberOfPeople}`);
  }

  const changesSummary = changes.join("\n");

  return {
    // Current/new training values
    "training.name": newTraining.training_name,
    "training.description": newTraining.description || "",
    "training.duration": newTraining.duration || "",
    "training.provider": newTraining.provider || "",
    "training.department": newTraining.department || "",
    "training.status": newTraining.status || "",
    "training.number_of_people": newNumberOfPeople,

    // Old training values
    "old_training.name": oldTraining.training_name,
    "old_training.description": oldTraining.description || "",
    "old_training.duration": oldTraining.duration || "",
    "old_training.provider": oldTraining.provider || "",
    "old_training.department": oldTraining.department || "",
    "old_training.status": oldTraining.status || "",
    "old_training.number_of_people": oldNumberOfPeople,

    // Changes summary
    changes_summary: changesSummary,

    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
