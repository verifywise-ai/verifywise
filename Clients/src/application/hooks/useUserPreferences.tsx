import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPreferencesModel } from "../../domain/models/Common/userPreferences/userPreferences.model";
import { getUserPreferencesByUserId } from "../repository/userPreferences.repository";
import { useAuth } from "./useAuth";
import { UserDateFormat } from "../../domain/enums/userDateFormat.enum";

const defaultUserPreferences: Omit<UserPreferencesModel, "id" | "user_id"> = {
  date_format: UserDateFormat.DD_MM_YYYY_DASH,
  language: "en",
};

const USER_PREFERENCES_QUERY_KEY = ["userPreferences"] as const;

const useUserPreferences = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: loading,
    error,
    isError,
  } = useQuery({
    queryKey: [...USER_PREFERENCES_QUERY_KEY, userId],
    queryFn: async () => {
      const response = await getUserPreferencesByUserId(userId!);
      return response.data as Omit<UserPreferencesModel, "id" | "user_id">;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const refreshUserPreferences = async () => {
    await queryClient.invalidateQueries({ queryKey: [...USER_PREFERENCES_QUERY_KEY, userId] });
  };

  return {
    userPreferences: data ?? defaultUserPreferences,
    isDefault: isError || !data,
    loading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refreshUserPreferences,
  };
};

export default useUserPreferences;
