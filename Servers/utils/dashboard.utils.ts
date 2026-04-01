import { sequelize } from "../database/db";
import { IDashboard } from "../domain.layer/interfaces/i.Dashboard";
import { getAllProjectsQuery } from "./project.utils";
import { PluginService } from "../services/plugin/pluginService";

export const getDashboardDataQuery = async (
  organizationId: number,
  userId: number,
  role: string
): Promise<IDashboard | null> => {
  const dashboard = {
    projects: 0,
    trainings: 0,
    models: 0,
    reports: 0,
    task_radar: {
      overdue: 0,
      due: 0,
      upcoming: 0,
    },
    projects_list: [],
  } as IDashboard;
  const projects = await getAllProjectsQuery({ userId, role }, organizationId);

  // Fetch additional use-cases from plugins (e.g., JIRA Assets)
  let allProjects = [...projects];
  try {
    const pluginUseCases = await PluginService.getDataFromProviders(
      "use-cases",
      organizationId,
      sequelize
    );
    if (pluginUseCases.length > 0) {
      console.log(`[Dashboard] Merging ${pluginUseCases.length} use-cases from plugins`);
      allProjects = [...projects, ...pluginUseCases];
    }
  } catch (pluginError) {
    console.error("[Dashboard] Error fetching plugin use-cases:", pluginError);
    // Continue with native projects even if plugin fetch fails
  }

  dashboard.projects_list = allProjects as any;
  dashboard.projects = allProjects.length;

  const trainings = await sequelize.query(
    `SELECT COUNT(*) FROM trainingregistar WHERE organization_id = :organizationId`,
    { replacements: { organizationId } }
  ) as [{ count: string }[], number];
  dashboard.trainings = parseInt(trainings[0][0].count);

 //Models data fetching from model_inventories table

  const models = await sequelize.query(
    `SELECT COUNT(*) FROM model_inventories WHERE organization_id = :organizationId`,
    { replacements: { organizationId } }
  ) as [{ count: string }[], number];
  dashboard.models = parseInt(models[0][0].count);

  const reports = await sequelize.query(
    `SELECT COUNT(*) FROM files AS f WHERE f.source::TEXT ILIKE '%report%' AND f.organization_id = :organizationId`,
    { replacements: { organizationId } }
  ) as [{ count: string }[], number];
  dashboard.reports = parseInt(reports[0][0].count);

  // Task radar - calculate overdue, due within 7 days, and upcoming tasks
  try {
    // Overdue: tasks where due_date < today and status is not 'Completed' or 'Deleted'
    const overdueTasks = await sequelize.query(
      `SELECT COUNT(*) FROM tasks
       WHERE due_date < CURRENT_DATE
       AND status NOT IN ('Completed', 'Deleted')
       AND organization_id = :organizationId`,
      { replacements: { organizationId } }
    ) as [{ count: string }[], number];
    dashboard.task_radar.overdue = parseInt(overdueTasks[0][0].count);

    // Due within 7 days: tasks where due_date is between today and 7 days from now
    const dueSoonTasks = await sequelize.query(
      `SELECT COUNT(*) FROM tasks
       WHERE due_date >= CURRENT_DATE
       AND due_date <= CURRENT_DATE + INTERVAL '7 days'
       AND status NOT IN ('Completed', 'Deleted')
       AND organization_id = :organizationId`,
      { replacements: { organizationId } }
    ) as [{ count: string }[], number];
    dashboard.task_radar.due = parseInt(dueSoonTasks[0][0].count);

    // Upcoming: tasks where due_date is more than 7 days from now
    const upcomingTasks = await sequelize.query(
      `SELECT COUNT(*) FROM tasks
       WHERE due_date > CURRENT_DATE + INTERVAL '7 days'
       AND status NOT IN ('Completed', 'Deleted')
       AND organization_id = :organizationId`,
      { replacements: { organizationId } }
    ) as [{ count: string }[], number];
    dashboard.task_radar.upcoming = parseInt(upcomingTasks[0][0].count);
  } catch (error) {
    // If tasks table doesn't exist or query fails, keep defaults (0)
    console.warn("Failed to fetch task radar data:", error);
  }

  return dashboard;
}