import { UserPreferencesModel } from "../../domain/models/Common/userPreferences/userPreferences.model";
import { apiServices } from "../../infrastructure/api/networkServices";

export async function getUserPreferencesByUserId(userId: number): Promise<any> {
  const response = await apiServices.get(`/user-preferences/${userId}`);
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
