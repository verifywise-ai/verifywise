import { UserPreferencesModel } from "../../domain/models/Common/userPreferences/userPreferences.model";
import { apiServices } from "../../infrastructure/api/networkServices";

export async function getUserPreferencesByUserId(userId: number): Promise<any> {
  const response = await apiServices.get(`/user-preferences/${userId}`);
  return response.data;
}

export async function getCurrentUserPreferences(): Promise<any> {
  const response = await apiServices.get("/users/me/preferences");
  return response.data;
}

export async function updateCurrentUserPreferences(
  data: Partial<Pick<UserPreferencesModel, "date_format" | "language">>,
): Promise<any> {
  const response = await apiServices.patch("/users/me/preferences", data);
  return response.data;
}

export async function createNewUserPreferences(data: Partial<UserPreferencesModel>): Promise<any> {
  const response = await apiServices.post(`/user-preferences/`, data);
  return response.data;
}

export async function updateUserPreferencesById({
  userId,
  data,
}: {
  userId: number;
  data: Partial<UserPreferencesModel>;
}): Promise<any> {
  const response = await apiServices.patch(`/user-preferences/${userId}`, data);
  return response.data;
}
