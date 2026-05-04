import { ENV_VARs } from "../../../env.vars";

export const downloadResource = async (resourceId: string, tenantHash: string): Promise<void> => {
  try {
    if (!tenantHash) {
      console.error("Tenant hash not found in token");
      return;
    }

    const url = `${ENV_VARs.URL}/api/aiTrustCentre/${tenantHash}/resources/${resourceId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/pdf",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get the blob from the response
    const blob = await response.blob();

    // Create a download link
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `resource-${resourceId}.pdf`; // Set the filename

    // Append to the document, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the URL object
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error("Error downloading resource:", error);
    // You might want to show a user-friendly error message here
  }
};
