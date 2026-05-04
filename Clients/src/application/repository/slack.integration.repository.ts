import { apiServices } from "../../infrastructure/api/networkServices";

export async function getSlackIntegrations({
  id,
  channel,
  signal,
  responseType = "json",
}: {
  id: number;
  channel?: string;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/slackWebhooks`, {
    userId: id,
    channel,
    signal,
    responseType,
  });
  return response.data;
}

export async function getSlackIntegrationById({
  id,
  signal,
  responseType = "json",
}: {
  id: number;
  signal?: AbortSignal;
  responseType?: string;
}): Promise<any> {
  const response = await apiServices.get(`/slackWebhooks/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

export async function createSlackIntegration({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post("/slackWebhooks", body);
  return response.data;
}

export async function updateSlackIntegration({
  id,
  body,
}: {
  id: number;
  body: any;
}): Promise<any> {
  const response = await apiServices.patch(`/slackWebhooks/${id}`, body);
  return response;
}

export async function sendSlackMessage({ id }: { id: number }): Promise<any> {
  const messageBody = {
    title: "Welcome to Verifywise",
    message: "This is a test message from VerifyWise.",
  };
  const response = await apiServices.post(`/slackWebhooks/${id}/send`, messageBody);
  return response.data;
}

export async function deleteSlackIntegration({ id }: { id: number }): Promise<any> {
  try {
    const response = await apiServices.delete(`/slackWebhooks/${id}`);
    return response.data;
  } catch (error) {
    console.error("Error deleting task:", error);
    throw error;
  }
}
