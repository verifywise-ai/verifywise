import { apiServices } from "../../infrastructure/api/networkServices";
import type { RaciRole, RaciSubjectType } from "../../domain/enums/raci.enum";

export type RaciSource = "owner" | "member" | "approver" | "task_assignee" | "manual";
export type RaciWarning = "no_accountable" | "multiple_accountable";

export interface RaciRow {
  subject_type: RaciSubjectType;
  subject_id: number | null;
  name: string;
  email: string | null;
  roles: Array<{ role: RaciRole; sources: RaciSource[] }>;
  editable: boolean;
}

export interface RaciMatrix {
  rows: RaciRow[];
  warnings: RaciWarning[];
}

const route = (projectId: number) => `/v1/projects/${projectId}/raci`;

export async function getRaciMatrix(projectId: number): Promise<RaciMatrix> {
  const response = await apiServices.get(route(projectId));
  return (response.data as { data: RaciMatrix }).data;
}

/** Sends the person's full desired set of roles; an empty set clears them. */
export async function updateRaciUserRoles(
  projectId: number,
  userId: number,
  roles: RaciRole[],
): Promise<RaciMatrix> {
  const response = await apiServices.put(`${route(projectId)}/users/${userId}`, { roles });
  return (response.data as { data: RaciMatrix }).data;
}
