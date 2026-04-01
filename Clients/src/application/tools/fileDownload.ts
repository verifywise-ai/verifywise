import { generateReport } from "../repository/entity.repository";
import { downloadFileFromManager } from "../repository/file.repository";
import { triggerBrowserDownload, extractFilenameFromHeaders } from "../../presentation/utils/browserDownload.utils";

interface GenerateReportProps {
  projectId: number | null;
  projectTitle: string;
  projectOwner: string;
  reportType: string | string[];
  reportName: string;
  frameworkId: number;
  projectFrameworkId: number;
  format: "pdf" | "docx";
  aiEnhanced?: boolean;
  llmKeyId?: number;
}

/**
 * Downloads a file by ID and triggers browser download
 *
 * @param fileId - The file ID to download
 * @param fileName - The name to save the file as
 * @throws Error if download fails
 */
export const handleDownload = async (fileId: string, fileName: string): Promise<void> => {
  if (!fileId) {
    console.error("Download failed: file ID is empty or undefined");
    throw new Error("Cannot download file: missing file ID");
  }

  try {
   const response = await downloadFileFromManager({
      id: typeof fileId === 'string' ? fileId : String(fileId),
    });
    const blob = new Blob([response], { type: response.type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(`Error downloading file (ID: ${fileId}, Name: ${fileName}):`, error);
    throw error;
  }
};

/**
 * Generates a report and triggers automatic download
 *
 * @param requestBody - Report generation parameters
 * @returns HTTP status code (200 for success, 500 for error)
 */
export const handleAutoDownload = async (requestBody: GenerateReportProps): Promise<number> => {
  try {
    const response = await generateReport({
      routeUrl: `/reporting/generate-report`,
      body: requestBody
    });

    if (response.status === 200) {
      // Extract filename from Content-Disposition header (DRY: using shared utility)
      const fileName = extractFilenameFromHeaders(response.headers, 'report');

      // Get blob content and content type
      const blobFileContent = response.data;
      const responseType = response.headers.get('Content-Type');

      // Create blob and trigger download
      const blob = new Blob([blobFileContent], { type: responseType || undefined });
      triggerBrowserDownload(blob, fileName);


      return response.status;
    } else {
      console.error("--- Error downloading report");
      return response.status;
    }
  } catch (error) {
    console.error("*** Error generating report", error);
    return 500;
  }
};
