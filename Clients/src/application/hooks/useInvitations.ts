import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getInvitations, Invitation } from "../repository/invitation.repository";
import { useAuth } from "./useAuth";

const INVITATIONS_QUERY_KEY = ["invitations"] as const;

const useInvitations = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: invitations = [],
    isLoading: loading,
    error,
  } = useQuery<Invitation[]>({
    queryKey: INVITATIONS_QUERY_KEY,
    queryFn: async () => {
      const response = await getInvitations();
      return response.invitations;
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const refreshInvitations = async () => {
    await queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
  };

  return {
    invitations,
    loading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refreshInvitations,
  };
};

export default useInvitations;
