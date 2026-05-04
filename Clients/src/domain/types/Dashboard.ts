import { Project } from "./Project";

export type Dashboard = {
  projects: number;
  trainings: number;
  models: number;
  reports: number;
  task_radar: {
    overdue: number;
    due: number;
    upcoming: number;
  };
  projects_list: Project[];
};
