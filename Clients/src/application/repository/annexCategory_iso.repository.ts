import { GetRequestParams } from "../../domain/interfaces/i.requestParams";
import { apiServices } from "../../infrastructure/api/networkServices";

export async function GetAnnexCategoriesById({
  routeUrl,
  signal,
  responseType = "json",
}: GetRequestParams) {
  const response = await apiServices.get(routeUrl, {
    signal,
    responseType,
  });
  return response.data;
}

// Update annex category by ID (with file upload)
export async function UpdateAnnexCategoryById({
  routeUrl,
  body,
  headers = {},
}: {
  routeUrl: string;
  body: FormData;
  headers?: Record<string, string>;
}) {
  try {
    const response = await apiServices.patch(routeUrl, body, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...headers,
      },
    });
    return response;
  } catch (error: any) {
    if (error instanceof Error && "response" in error && error.response) {
      // Handle specific HTTP error responses
      throw error;
    } else if (error instanceof Error && "request" in error) {
      // Handle network errors
      throw new Error("Network error - unable to reach the server");
    } else {
      // Handle other errors
      throw error;
    }
  }
}
