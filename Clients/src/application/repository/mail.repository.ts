import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Mail Repository
 * Handles email-related API calls
 */

interface InviteEmailData {
  to: string;
  email: string;
  name: string;
  surname: string;
  roleId: string;
  organizationId: string;
}

interface ApiResponse<T = unknown> {
  status: number;
  data?: T;
  message?: string;
}

/**
 * Send an invitation email to a new team member
 *
 * @param {InviteEmailData} data - The invitation data
 * @returns {Promise<ApiResponse>} The API response
 */
export async function sendInviteEmail(data: InviteEmailData): Promise<ApiResponse> {
  const response = await apiServices.post("/mail/invite", data);
  return response;
}
