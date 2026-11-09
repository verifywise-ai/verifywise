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

/** Only the roles to change: the server applies them to what the person holds now. */
export interface RaciRoleChange {
  add?: RaciRole[];
  remove?: RaciRole[];
}

export async function updateRaciUserRoles(
  projectId: number,
  userId: number,
  change: RaciRoleChange,
): Promise<RaciMatrix> {
  const response = await apiServices.put(`${route(projectId)}/users/${userId}`, change);
  return (response.data as { data: RaciMatrix }).data;
}
