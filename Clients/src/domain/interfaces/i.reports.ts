import { Project } from "../types/Project";

export interface GeneratedReports {
  id: number;
  filename: string;
  type: string;
  uploaded_time: string;
  project_id: string | number | null;
  project_title: string;
  source: string;
  uploader_name: string;
  uploader_surname: string;
}

export interface UseGeneratedReportsParams {
  projectId: string;
  projects: Project[];
  refreshKey?: any;
}
