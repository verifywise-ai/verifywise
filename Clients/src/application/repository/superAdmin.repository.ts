import { apiServices } from "../../infrastructure/api/networkServices";

export interface Organization {
  id: number;
  name: string;
  logo: string;
  created_at: string;
  onboarding_status: string;
  user_count: number;
}

export interface OrgUser {
  id: number;
  name: string;
  surname: string;
  email: string;
  role_id: number;
  role_name: string;
  created_at: string;
  last_login: string;
}

export interface GlobalUser extends OrgUser {
  organization_id: number;
  organization_name: string;
}

// The server wraps responses as { code: number, data: T }
interface ServerResponse<T> {
  code: number;
  data: T;
}

export async function getOrganizations() {
  return apiServices.get<ServerResponse<Organization[]>>("/super-admin/organizations");
}

export async function createOrganization(data: { name: string; logo?: string }) {
  return apiServices.post<ServerResponse<Organization>>("/super-admin/organizations", data);
}

export async function deleteOrganization(id: number) {
  return apiServices.delete(`/super-admin/organizations/${id}`);
}

export async function updateOrganization(id: number, data: { name?: string; logo?: string }) {
  return apiServices.patch(`/super-admin/organizations/${id}`, data);
}

export async function getAllUsers() {
  return apiServices.get<ServerResponse<GlobalUser[]>>("/super-admin/users");
}

export async function getOrgUsers(orgId: number) {
  return apiServices.get<ServerResponse<OrgUser[]>>(`/super-admin/organizations/${orgId}/users`);
}

export async function inviteUserToOrg(orgId: number, data: { email: string; name: string; surname?: string; roleId: number }) {
  return apiServices.post(`/super-admin/organizations/${orgId}/invite`, data);
}

export async function removeUser(userId: number) {
  return apiServices.delete(`/super-admin/users/${userId}`);
}
