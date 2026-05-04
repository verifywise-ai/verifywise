import { IProjectAttributes } from "./i.project";

export interface IDashboard {
  projects: number;
  trainings: number;
  models: number;
  reports: number;
  task_radar: {
    overdue: number;
    due: number;
    upcoming: number;
  };
  projects_list: IProjectAttributes[];
}
