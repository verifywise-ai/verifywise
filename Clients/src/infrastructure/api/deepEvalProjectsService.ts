/**
 * DeepEval Projects API Service
 *
 * Manages DeepEval projects (CRUD operations).
 */

import CustomAxios from "./customAxios";
import type { DeepEvalProject } from "../../presentation/pages/EvalsDashboard/types";

const BASE_URL = "/deepeval";

class DeepEvalProjectsService {
  /**
   * Create a new project
   */
  async createProject(projectData: Partial<DeepEvalProject>): Promise<{
    project: DeepEvalProject;
    message: string;
  }> {
    const response = await CustomAxios.post(`${BASE_URL}/projects`, projectData);
    return response.data;
  }

  /**
   * Get all projects for current tenant
   */
  async getAllProjects(): Promise<{ projects: DeepEvalProject[] }> {
    const response = await CustomAxios.get(`${BASE_URL}/projects`);
    return response.data;
  }

  /**
   * Get a specific project
   */
  async getProject(projectId: string): Promise<{ project: DeepEvalProject }> {
    const response = await CustomAxios.get(`${BASE_URL}/projects/${projectId}`);
    return response.data;
  }

  /**
   * Update a project
   */
  async updateProject(
    projectId: string,
    projectData: Partial<DeepEvalProject>,
  ): Promise<{
    project: DeepEvalProject;
    message: string;
  }> {
    const response = await CustomAxios.put(`${BASE_URL}/projects/${projectId}`, projectData);
    return response.data;
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string): Promise<{
    message: string;
    projectId: string;
  }> {
    const response = await CustomAxios.delete(`${BASE_URL}/projects/${projectId}`);
    return response.data;
  }

  /**
   * Get project statistics
   */
  async getProjectStats(projectId: string): Promise<{
    stats: {
      projectId: string;
      totalExperiments: number;
      lastRunDate: string | null;
      avgMetrics: Record<string, number>;
    };
  }> {
    const response = await CustomAxios.get(`${BASE_URL}/projects/${projectId}/stats`);
    return response.data;
  }
}

export const deepEvalProjectsService = new DeepEvalProjectsService();
