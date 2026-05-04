import { updateEntityById } from "./entity.repository";

/**
 * Parameters for updating EU AI Act question status
 */
export interface UpdateEUAIActQuestionStatusParams {
  answerId: number;
  newStatus: string;
  userId: number;
}

/**
 * Update EU AI Act question status via API
 * Follows the same pattern as ISO status updates
 *
 * @param params - Update parameters (answerId, newStatus, userId)
 * @returns Promise<boolean> - True if update was successful
 */
export async function updateEUAIActQuestionStatus(
  params: UpdateEUAIActQuestionStatusParams,
): Promise<boolean> {
  try {
    // Create FormData to match backend's multipart/form-data expectation
    const formData = new FormData();
    formData.append("status", params.newStatus);
    formData.append("user_id", params.userId.toString());
    // Append empty arrays for optional fields to prevent undefined parsing errors
    formData.append("delete", JSON.stringify([]));
    formData.append("risksDelete", JSON.stringify([]));
    formData.append("risksMitigated", JSON.stringify([]));

    const response = await updateEntityById({
      routeUrl: `/eu-ai-act/saveAnswer/${params.answerId}`,
      body: formData,
    });

    return !!response;
  } catch (error) {
    console.error("Failed to update EU AI Act question status:", error);
    return false;
  }
}
