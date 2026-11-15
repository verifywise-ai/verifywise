import { apiServices } from "../../infrastructure/api/networkServices";

// The organization's Slack connections, behind the Slack extension gate (Admins only).
const BASE = "/extensions/slack/oauth/workspaces";

/** The organization's connections. The server takes the organization from the session. */
export async function getSlackIntegrations({
  channel,
  signal,
  responseType = "json",
}: {
  channel?: string;
  signal?: AbortSignal;
  responseType?: string;
} = {}): Promise<any> {
  const response = await apiServices.get(BASE, {
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
  const response = await apiServices.get(`${BASE}/${id}`, {
    signal,
    responseType,
  });
  return response.data;
}

export async function createSlackIntegration({ body }: { body: any }): Promise<any> {
  const response = await apiServices.post(BASE, body);
  return response.data;
}

export async function updateSlackIntegration({
  id,
  body,
}: {
  id: number;
  body: any;
}): Promise<any> {
  const response = await apiServices.patch(`${BASE}/${id}`, body);
  return response;
}

export async function sendSlackMessage({ id }: { id: number }): Promise<any> {
  const messageBody = {
    title: "Welcome to Verifywise",
    message: "This is a test message from VerifyWise.",
  };
  const response = await apiServices.post(`${BASE}/${id}/send`, messageBody);
  return response.data;
}

export async function deleteSlackIntegration({ id }: { id: number }): Promise<any> {
  const response = await apiServices.delete(`${BASE}/${id}`);
  return response.data;
}
