import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Auth Repository
 * Handles authentication-related API calls
 */

interface PasswordResetEmailData {
  to: string;
  email: string;
  name: string;
}

interface ResetPasswordData {
  email: string;
  newPassword: string;
}

interface ApiResponse<T = unknown> {
  status: number;
  data?: T;
  message?: string;
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<ApiResponse> {
  const response = await apiServices.post("/mail/reset-password", data);
  return response;
}

/**
 * Reset password with token
 */
export async function resetPassword(data: ResetPasswordData, token: string): Promise<ApiResponse> {
  const response = await apiServices.post("/users/reset-password", data, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response;
}
