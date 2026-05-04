import { apiServices } from "../../infrastructure/api/networkServices";
import { APIError } from "../tools/error";

export type EntityType =
  | "vendor"
  | "model"
  | "policy"
  | "nist_subcategory"
  | "iso42001_subclause"
  | "iso42001_annexcategory"
  | "iso42001_assessment"
  | "iso27001_subclause"
  | "iso27001_annexcontrol"
  | "iso27001_assessment"
  | "eu_control"
  | "eu_subcontrol"
  | "eu_assessment";

export interface ITaskEntityLink {
  id: number;
  task_id: number;
  entity_id: number;
  entity_type: EntityType;
  entity_name?: string;
  created_at?: string;
  updated_at?: string;
}

function extractData<T>(response: { data: { data: T } }): T {
  return response.data.data;
}

/**
 * Get all entity links for a task
 */
export async function getTaskEntityLinks(taskId: number): Promise<ITaskEntityLink[]> {
  try {
    const response = await apiServices.get<{
      message: string;
      data: ITaskEntityLink[];
    }>(`/tasks/${taskId}/entities`);
    return extractData<ITaskEntityLink[]>(response);
  } catch (error: any) {
    throw new APIError("Failed to fetch task entity links", error?.response?.status, error);
  }
}

/**
 * Add an entity link to a task
 */
export async function addTaskEntityLink(
  taskId: number,
  entityId: number,
  entityType: EntityType,
  entityName?: string,
): Promise<ITaskEntityLink> {
  try {
    const response = await apiServices.post<{
      message: string;
      data: ITaskEntityLink;
    }>(`/tasks/${taskId}/entities`, {
      entity_id: entityId,
      entity_type: entityType,
      entity_name: entityName,
    });
    return extractData<ITaskEntityLink>(response);
  } catch (error: any) {
    throw new APIError("Failed to add entity link to task", error?.response?.status, error);
  }
}

/**
 * Remove an entity link from a task
 */
export async function removeTaskEntityLink(taskId: number, linkId: number): Promise<void> {
  try {
    await apiServices.delete(`/tasks/${taskId}/entities/${linkId}`);
  } catch (error: any) {
    throw new APIError("Failed to remove entity link from task", error?.response?.status, error);
  }
}
