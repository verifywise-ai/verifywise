import { logEngine } from "../tools/log.engine";
import { FormValues } from "../validations/formValidation";
import { API_RESPONSES, UNEXPECTED } from "../constants/apiResponses";
import { createNewUser } from "../repository/user.repository";
import { ApiResponse, User } from "../../domain/types/User";

interface RegisterUser {
  id: string;
  email?: string;
  firstname: string;
  lastname: string;
  roleId: number;
}

const useRegisterUser = () => {
  const handleApiResponse = ({
    response,
    setIsSubmitting,
  }: {
    response: ApiResponse<User>;
    user: RegisterUser;
    setIsSubmitting: (value: boolean) => void;
  }) => {
    const config = API_RESPONSES[response.status] || UNEXPECTED;

    logEngine({
      type: config.logType,
      message: config.message,
    });

    setIsSubmitting(false);
  };

  const registerUser = async (
    {
      values,
      user,
      setIsSubmitting,
    }: {
      values: FormValues;
      user: RegisterUser;
      setIsSubmitting: (value: boolean) => void;
    },
    userToken: string | null,
  ) => {
    try {
      const response = await createNewUser(
        {
          userData: { ...values, role_id: user.roleId || 1 },
        },
        {
          Authorization: `Bearer ${userToken || ""}`,
        },
      );
      handleApiResponse({ response, user, setIsSubmitting });
      return {
        isSuccess: response.status,
        response: response,
      };
    } catch (error: any) {
      logEngine({
        type: "error",
        message: `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      setIsSubmitting(false);
      return {
        isSuccess: error.status || false,
        response: error,
      };
    }
  };

  return { registerUser };
};

export default useRegisterUser;
