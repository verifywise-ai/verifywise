import { apiServices } from "../../infrastructure/api/networkServices";

/**
 * Fetches the AI Trust Center overview data.
 *
 * @returns {Promise<any>} The AI Trust Center overview data.
 */
export async function getAITrustCentreOverview(): Promise<any> {
  try {
    const response = await apiServices.get("/aiTrustCentre/overview");
    return response.data;
  } catch (error) {
    console.error("Error fetching AI Trust Center overview:", error);
    throw error;
  }
}

/**
 * Updates the AI Trust Center overview.
 *
 * @param {any} data - The AI Trust Center overview data to be updated.
 * @returns {Promise<any>} The response from the API.
 */
export async function updateAITrustCentreOverview(data: any): Promise<any> {
  try {
    const response = await apiServices.put("/aiTrustCentre/overview", data);
    return response.data;
  } catch (error) {
    console.error("Error updating AI Trust Center overview:", error);
    throw error;
  }
}

/**
 * Uploads the AI Trust Center logo.
 *
 * @param {File} logoFile - The logo file to upload.
 * @returns {Promise<any>} The response from the API.
 */
export async function uploadAITrustCentreLogo(logoFile: File): Promise<any> {
  try {
    const formData = new FormData();
    formData.append("logo", logoFile);

    const response = await apiServices.post("/aiTrustCentre/logo", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error uploading AI Trust Center logo:", error);
    throw error;
  }
}

/**
 * Deletes the AI Trust Center logo.
 *
 * @returns {Promise<any>} The response from the API.
 */
export async function deleteAITrustCentreLogo(): Promise<any> {
  try {
    const response = await apiServices.delete("/aiTrustCentre/logo");
    return response.data;
  } catch (error) {
    console.error("Error deleting AI Trust Center logo:", error);
    throw error;
  }
}

/**
 * Creates a new AI Trust Center resource with file upload.
 *
 * @param {File} file - The file to upload.
 * @param {string} name - The name of the resource.
 * @param {string} description - The description of the resource.
 * @param {boolean} [visible=true] - Whether the resource is visible (defaults to true).
 * @returns {Promise<any>} The response from the API.
 */
export async function createAITrustCentreResource(
  file: File,
  name: string,
  description: string,
  visible: boolean = true,
): Promise<any> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    formData.append("description", description);
    formData.append("visible", visible.toString());

    const response = await apiServices.post("/aiTrustCentre/resources", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error creating AI Trust Center resource:", error);
    throw error;
  }
}

/**
 * Fetches AI Trust Center resources.
 *
 * @returns {Promise<any>} The AI Trust Center resources.
 */
export async function getAITrustCentreResources(): Promise<any> {
  try {
    const response = await apiServices.get("/aiTrustCentre/resources");
    return response.data;
  } catch (error) {
    console.error("Error fetching AI Trust Center resources:", error);
    throw error;
  }
}

/**
 * Deletes an AI Trust Center resource.
 *
 * @param {number} resourceId - The ID of the resource to delete.
 * @returns {Promise<any>} The response from the API.
 */
export async function deleteAITrustCentreResource(resourceId: number): Promise<any> {
  try {
    const response = await apiServices.delete(`/aiTrustCentre/resources/${resourceId}`);
    return response.data;
  } catch (error) {
    console.error("Error deleting AI Trust Center resource:", error);
    throw error;
  }
}

/**
 * Updates an AI Trust Center resource.
 *
 * @param {number} resourceId - The ID of the resource to update.
 * @param {string} name - The name of the resource.
 * @param {string} description - The description of the resource.
 * @param {boolean} visible - Whether the resource is visible.
 * @param {File} [file] - Optional file to replace the existing one.
 * @param {number} [oldFileId] - The ID of the old file to delete when replacing.
 * @returns {Promise<any>} The response from the API.
 */
export async function updateAITrustCentreResource(
  resourceId: number,
  name: string,
  description: string,
  visible: boolean,
  file?: File,
  oldFileId?: number,
): Promise<any> {
  try {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("visible", visible.toString());

    // Only append file if it's provided
    if (file) {
      formData.append("file", file);
    }

    // Append old file ID for deletion if provided
    if (oldFileId) {
      formData.append("delete", oldFileId.toString());
    }

    const response = await apiServices.put(`/aiTrustCentre/resources/${resourceId}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error updating AI Trust Center resource:", error);
    throw error;
  }
}

/**
 * Fetches AI Trust Center subprocessors.
 *
 * @returns {Promise<any>} The AI Trust Center subprocessors.
 */
export async function getAITrustCentreSubprocessors(): Promise<any> {
  try {
    const response = await apiServices.get("/aiTrustCentre/subprocessors");
    return response.data;
  } catch (error) {
    console.error("Error fetching AI Trust Center subprocessors:", error);
    throw error;
  }
}

/**
 * Creates a new AI Trust Center subprocessor.
 *
 * @param {string} name - The name of the subprocessor.
 * @param {string} purpose - The purpose of the subprocessor.
 * @param {string} location - The location of the subprocessor.
 * @param {string} url - The URL of the subprocessor.
 * @returns {Promise<any>} The response from the API.
 */
export async function createAITrustCentreSubprocessor(
  name: string,
  purpose: string,
  location: string,
  url: string,
): Promise<any> {
  try {
    const response = await apiServices.post(
      "/aiTrustCentre/subprocessors",
      {
        name,
        purpose,
        location,
        url,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error("Error creating AI Trust Center subprocessor:", error);
    throw error;
  }
}

/**
 * Updates an AI Trust Center subprocessor.
 *
 * @param {number} subprocessorId - The ID of the subprocessor to update.
 * @param {string} name - The name of the subprocessor.
 * @param {string} purpose - The purpose of the subprocessor.
 * @param {string} location - The location of the subprocessor.
 * @param {string} url - The URL of the subprocessor.
 * @returns {Promise<any>} The response from the API.
 */
export async function updateAITrustCentreSubprocessor(
  subprocessorId: number,
  name: string,
  purpose: string,
  location: string,
  url: string,
): Promise<any> {
  try {
    const response = await apiServices.put(
      `/aiTrustCentre/subprocessors/${subprocessorId}`,
      {
        name,
        purpose,
        location,
        url,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error("Error updating AI Trust Center subprocessor:", error);
    throw error;
  }
}

/**
 * Deletes an AI Trust Center subprocessor.
 *
 * @param {number} subprocessorId - The ID of the subprocessor to delete.
 * @returns {Promise<any>} The response from the API.
 */
export async function deleteAITrustCentreSubprocessor(subprocessorId: number): Promise<any> {
  try {
    const response = await apiServices.delete(`/aiTrustCentre/subprocessors/${subprocessorId}`);
    return response.data;
  } catch (error) {
    console.error("Error deleting AI Trust Center subprocessor:", error);
    throw error;
  }
}

/**
 * Fetches the AI Trust Center logo for a specific tenant.
 *
 * @param {string} tenantId - The tenant ID to fetch the logo for.
 * @returns {Promise<any>} The logo data from the API.
 */
export async function getAITrustCentreLogo(tenantId: string): Promise<any> {
  try {
    const response = await apiServices.get(`/aiTrustCentre/${tenantId}/logo`, {
      responseType: "json",
    });
    return response.data;
  } catch (error: any) {
    // 404 is expected when no logo has been uploaded - don't log as error
    if (error?.response?.status === 404 || error?.status === 404) {
      return null;
    }
    console.error("Error fetching AI Trust Center logo:", error);
    throw error;
  }
}
