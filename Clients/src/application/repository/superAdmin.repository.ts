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

export interface OrgInvitation {
  id: number;
  email: string;
  name: string;
  surname: string;
  role_id: number;
  role_name: string | null;
  status: string;
  invited_by: number;
  created_at: string;
  expires_at: string;
}

export async function getOrgInvitations(orgId: number) {
  return apiServices.get<ServerResponse<OrgInvitation[]>>(
    `/super-admin/organizations/${orgId}/invitations`,
  );
}

export async function inviteUserToOrg(
  orgId: number,
  data: { email: string; name: string; surname?: string; roleId: number },
) {
  return apiServices.post(`/super-admin/organizations/${orgId}/invite`, data);
}

export async function createUserInOrg(
  orgId: number,
  // password: required for a new account; an existing account keeps its own.
  data: { email: string; name: string; surname?: string; password?: string; roleId: number },
) {
  // existing_account: the email already had an account, which was added to
  // the organization with its own name and password.
  return apiServices.post<ServerResponse<OrgUser & { existing_account?: boolean }>>(
    `/super-admin/organizations/${orgId}/users`,
    data,
  );
}

/** Removes a user from one organization; the account goes only with its last one. */
export async function removeOrgUser(orgId: number, userId: number) {
  return apiServices.delete<
    ServerResponse<{ removed: true; userId: number; accountDeleted: boolean }>
  >(`/super-admin/organizations/${orgId}/users/${userId}`);
}

export async function createOrgWithUser(data: {
  orgName: string;
  logo?: string;
  mode: "invite" | "direct";
  user: {
    email: string;
    name: string;
    surname: string;
    roleId: number;
    password?: string;
  };
}) {
  return apiServices.post<ServerResponse<{ organizationId: number; existingAccount?: boolean }>>(
    `/super-admin/organizations-with-user`,
    data,
  );
}

export async function checkEmailExists(email: string) {
  return apiServices.get<ServerResponse<{ exists: boolean }>>(
    `/super-admin/users/exists?email=${encodeURIComponent(email)}`,
  );
}

/** Name and email are the account's; a role is set in one organization, so it needs organizationId. */
export async function updateUser(
  userId: number,
  data: {
    name?: string;
    surname?: string;
    email?: string;
    roleId?: number;
    organizationId?: number;
  },
) {
  return apiServices.patch(`/super-admin/users/${userId}`, data);
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
  /** Empty for a pure super admin. */
  organizations: {
    organization_id: number;
    organization_name: string;
    role_id: number;
    role_name: string;
  }[];
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
