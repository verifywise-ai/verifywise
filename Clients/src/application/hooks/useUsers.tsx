import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User } from "../../domain/types/User";
import { getAllUsers } from "../repository/user.repository";
import { useAuth } from "./useAuth";

interface ApiUser {
  id: number;
  name: string;
  surname: string;
  email: string;
  role_id?: number;
}
interface ApiResponse {
  data: ApiUser[];
}

const USERS_QUERY_KEY = ["users"] as const;

const useUsers = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: users = [],
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => {
      const response = await getAllUsers();
      // Convert role_id to roleId
      const formattedUsers: User[] = (response as ApiResponse).data.map(
        (user: ApiUser): User => ({
          id: user.id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          roleId: user.role_id,
        }),
      );
      return formattedUsers;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
  };

  return {
    users,
    loading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refreshUsers,
  };
};

export default useUsers;
