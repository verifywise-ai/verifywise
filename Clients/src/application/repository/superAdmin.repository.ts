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

export async function getUserCount() {
  return apiServices.get<ServerResponse<{ count: number }>>("/super-admin/users/count");
}

export async function getAllUsers() {
  return apiServices.get<ServerResponse<GlobalUser[]>>("/super-admin/users");
}

export async function getOrgUsers(orgId: number) {
  return apiServices.get<ServerResponse<OrgUser[]>>(`/super-admin/organizations/${orgId}/users`);
}

export async function inviteUserToOrg(
  orgId: number,
  data: { email: string; name: string; surname?: string; roleId: number },
) {
  return apiServices.post(`/super-admin/organizations/${orgId}/invite`, data);
}

export async function updateUser(
  userId: number,
  data: { name?: string; surname?: string; email?: string; roleId?: number },
) {
  return apiServices.patch(`/super-admin/users/${userId}`, data);
}

export async function removeUser(userId: number) {
  return apiServices.delete(`/super-admin/users/${userId}`);
}

export interface MonitoringConfig {
  enabled: boolean;
  otlp_endpoint: string | null;
  deployment_name: string | null;
  auth_header_set: boolean;
  updated_by: number | null;
  updated_at: string | null;
}

export interface MonitoringConfigInput {
  enabled: boolean;
  otlp_endpoint: string;
  deployment_name: string;
}

export async function getMonitoringConfig() {
  return apiServices.get<ServerResponse<MonitoringConfig>>("/super-admin/monitoring");
}

export async function updateMonitoringConfig(data: MonitoringConfigInput) {
  return apiServices.put<ServerResponse<MonitoringConfig>>("/super-admin/monitoring", data);
}

/**
 * Ask the backend to mint a signed (RS256) push token for this deployment. The
 * backend signs it with its private key; the response only reports
 * `auth_header_set` — the raw token is never returned to the browser.
 */
export async function generateMonitoringToken() {
  return apiServices.post<ServerResponse<MonitoringConfig>>("/super-admin/monitoring/token", {});
}

export interface SuperAdminEntry {
  user_id: number;
  name: string;
  surname: string;
  email: string;
  role_id: number | null;
  role_name: string | null;
  organization_id: number | null;
  organization_name: string | null;
}

export async function listSuperAdmins() {
  return apiServices.get<ServerResponse<SuperAdminEntry[]>>("/super-admin/super-admins");
}

export async function grantSuperAdmin(userId: number) {
  return apiServices.post<ServerResponse<{ user_id: number }>>("/super-admin/super-admins", {
    user_id: userId,
  });
}

export async function revokeSuperAdmin(userId: number) {
  return apiServices.delete(`/super-admin/super-admins/${userId}`);
}
