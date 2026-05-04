// Build replacement dict for task
export function buildTaskReplacements(task: any): Record<string, any> {
  return {
    "task.id": task.id,
    "task.title": task.title,
    "task.description": task.description || "",
    "task.creator": task.creator_name || task.creator_id,
    "task.assignees": task.assignee_names || "",
    "task.due_date": task.due_date
      ? new Date(task.due_date).toLocaleDateString("en-US", { dateStyle: "long" })
      : "",
    "task.priority": task.priority,
    "task.status": task.status,
    "task.categories": Array.isArray(task.categories) ? task.categories.join(", ") : "",
    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}

export function buildTaskUpdateReplacements(oldTask: any, newTask: any): Record<string, any> {
  const dueDate = newTask.due_date
    ? new Date(newTask.due_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const oldDueDate = oldTask.due_date
    ? new Date(oldTask.due_date).toLocaleDateString("en-US", { dateStyle: "long" })
    : "";
  const categories = Array.isArray(newTask.categories) ? newTask.categories.join(", ") : "";
  const oldCategories = Array.isArray(oldTask.categories) ? oldTask.categories.join(", ") : "";

  // Build changes summary - only show changed fields with arrow, unchanged fields without arrow
  const changes: string[] = [];

  if (oldTask.title !== newTask.title) {
    changes.push(`• Title: ${oldTask.title || "(empty)"} → ${newTask.title || "(empty)"}`);
  } else if (newTask.title) {
    changes.push(`• Title: ${newTask.title}`);
  }

  if (oldTask.description !== newTask.description) {
    changes.push(
      `• Description: ${oldTask.description || "(empty)"} → ${newTask.description || "(empty)"}`,
    );
  } else if (newTask.description) {
    changes.push(`• Description: ${newTask.description}`);
  }

  const oldCreator = oldTask.creator_name || oldTask.creator_id;
  const newCreator = newTask.creator_name || newTask.creator_id;
  if (oldCreator !== newCreator) {
    changes.push(`• Creator: ${oldCreator || "(empty)"} → ${newCreator || "(empty)"}`);
  } else if (newCreator) {
    changes.push(`• Creator: ${newCreator}`);
  }

  const oldAssignees = oldTask.assignee_names || "";
  const newAssignees = newTask.assignee_names || "";
  if (oldAssignees !== newAssignees) {
    changes.push(`• Assignees: ${oldAssignees || "(empty)"} → ${newAssignees || "(empty)"}`);
  } else if (newAssignees) {
    changes.push(`• Assignees: ${newAssignees}`);
  }

  if (oldDueDate !== dueDate) {
    changes.push(`• Due Date: ${oldDueDate || "(empty)"} → ${dueDate || "(empty)"}`);
  } else if (dueDate) {
    changes.push(`• Due Date: ${dueDate}`);
  }

  if (oldTask.priority !== newTask.priority) {
    changes.push(`• Priority: ${oldTask.priority || "(empty)"} → ${newTask.priority || "(empty)"}`);
  } else if (newTask.priority) {
    changes.push(`• Priority: ${newTask.priority}`);
  }

  if (oldTask.status !== newTask.status) {
    changes.push(`• Status: ${oldTask.status || "(empty)"} → ${newTask.status || "(empty)"}`);
  } else if (newTask.status) {
    changes.push(`• Status: ${newTask.status}`);
  }

  if (oldCategories !== categories) {
    changes.push(`• Categories: ${oldCategories || "(empty)"} → ${categories || "(empty)"}`);
  } else if (categories) {
    changes.push(`• Categories: ${categories}`);
  }

  const changesSummary = changes.join("\n");

  return {
    // Current/new task values
    "task.id": newTask.id,
    "task.title": newTask.title,
    "task.description": newTask.description || "",
    "task.creator": newCreator,
    "task.assignees": newAssignees,
    "task.due_date": dueDate,
    "task.priority": newTask.priority,
    "task.status": newTask.status,
    "task.categories": categories,

    // Old task values
    "old_task.id": oldTask.id,
    "old_task.title": oldTask.title,
    "old_task.description": oldTask.description || "",
    "old_task.creator": oldCreator,
    "old_task.assignees": oldAssignees,
    "old_task.due_date": oldDueDate,
    "old_task.priority": oldTask.priority,
    "old_task.status": oldTask.status,
    "old_task.categories": oldCategories,

    // Changes summary
    changes_summary: changesSummary,

    date_and_time: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
}
