import { apiServices } from "../../infrastructure/api/networkServices";
import { ApiResponse, User } from "../../domain/types/User";

/**
 * User data for creating a new user
 * Note: API expects snake_case (role_id) but we also accept roleId for flexibility
 */
interface CreateUserData {
  name: string;
  surname: string;
  email: string;
  password: string;
  roleId?: number;
  role_id?: number;
  organizationId?: number;
  organization_id?: number;
}

/**
 * User data for updating an existing user
 */
interface UpdateUserData {
  name?: string;
  surname?: string;
  email?: string;
  roleId?: number;
  organizationId?: number;
}

/**
 * Login credentials
 */
interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Response from password change endpoint
 */
interface PasswordChangeResponse {
  message: string;
}

/**
 * Response from delete endpoint
 */
interface DeleteResponse {
  message: string;
}

/**
 * Response from check user exists endpoint
 */
interface UserExistsResponse {
  exists: boolean;
}

/**
 * Response from profile photo upload/fetch
 */
interface ProfilePhotoResponse {
  photoUrl?: string;
  message?: string;
  photo?: unknown | null;
}

export async function getUserById({
  userId,
}: {
  userId: number | string;
}): Promise<ApiResponse<User>> {
  const response = await apiServices.get(`/users/${userId}`);
  return response.data as ApiResponse<User>;
}

export async function getAllUsers(): Promise<ApiResponse<User[]>> {
  const response = await apiServices.get(`/users`);
  return response.data as ApiResponse<User[]>;
}

export async function createNewUser({
  userData,
}: {
  userData: CreateUserData;
}, headers?: Record<string, string>): Promise<ApiResponse<User>> {
  try {
    const response = await apiServices.post(`/users/register`, userData, { headers });
    return response as ApiResponse<User>;
  } catch (error: unknown) {
    // Re-throw the error with the response data intact
    const axiosError = error as { response?: { status: number; data: unknown } };
    if (axiosError.response) {
      const errorObj = error as Record<string, unknown>;
      throw {
        ...errorObj,
        status: axiosError.response.status,
        data: axiosError.response.data,
      };
    }
    throw error;
  }
}

export async function updateUserById({
  userId,
  userData,
}: {
  userId: number | string;
  userData: UpdateUserData;
}): Promise<ApiResponse<User>> {
  const response = await apiServices.patch(`/users/${userId}`, userData);
  return response as ApiResponse<User>;
}

export async function updatePassword({
  userId,
  currentPassword,
  newPassword,
}: {
  userId: number | string;
  currentPassword: string;
  newPassword: string;
}): Promise<ApiResponse<PasswordChangeResponse>> {
  const response = await apiServices.patch(`/users/chng-pass/${userId}`, {
    id: userId,
    currentPassword,
    newPassword,
  });
  return response as ApiResponse<PasswordChangeResponse>;
}

export async function deleteUserById({
  userId,
}: {
  userId: number | string;
}): Promise<ApiResponse<DeleteResponse>> {
  try {
    const response = await apiServices.delete(`/users/${userId}`);
    return response as ApiResponse<DeleteResponse>;
  } catch (error: unknown) {
    // Handle 403 (demo user deletion) as a normal response, not an exception
    const axiosError = error as { status?: number; data?: { data?: string } };
    if (axiosError.status === 403) {
      return {
        data: { message: axiosError.data?.data || "User cannot be deleted" },
        status: 403,
      };
    }
    throw error;
  }
}

export async function checkUserExists(): Promise<UserExistsResponse> {
  const response = await apiServices.get<UserExistsResponse>(`/users/check/exists`);
  return response.data;
}

/**
 * Login response with nested data structure
 */
interface LoginResponse {
  data: {
    token: string;
    onboarding_status?: string;
    is_org_creator?: boolean;
    isSuperAdmin?: boolean;
  };
}

export async function loginUser({ body }: { body: LoginCredentials }): Promise<ApiResponse<LoginResponse>> {
  const response = await apiServices.post<LoginResponse>(`/users/login`, body);
  return response;
}

export async function uploadUserProfilePhoto(
  userId: number | string,
  photoFile: File,
): Promise<ApiResponse<ProfilePhotoResponse>> {
  const formData = new FormData();
  formData.append("photo", photoFile);

  const response = await apiServices.post<ProfilePhotoResponse>(
    `/users/${userId}/profile-photo`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response;
}

export async function getUserProfilePhoto(userId: number | string): Promise<ProfilePhotoResponse> {
  try {
    const response = await apiServices.get<ProfilePhotoResponse>(`/users/${userId}/profile-photo`, {
      responseType: "json",
    });
    return response.data;
  } catch (error: unknown) {
    // Handle 404 (no profile photo) as a normal response, not an exception
    const axiosError = error as { status?: number };
    if (axiosError.status === 404) {
      return { photo: null } as ProfilePhotoResponse;
    }
    throw error;
  }
}

/**
 * Deletes a user's profile photo.
 *
 * @param {number | string} userId - The ID of the user.
 * @returns {Promise<ApiResponse<DeleteResponse>>} The response from the API.
 */
export async function deleteUserProfilePhoto(userId: number | string): Promise<ApiResponse<DeleteResponse>> {
  const response = await apiServices.delete<DeleteResponse>(`/users/${userId}/profile-photo`);
  return response;
}
