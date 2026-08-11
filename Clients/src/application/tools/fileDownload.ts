import { downloadFileFromManager } from "../repository/file.repository";

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
      id: typeof fileId === "string" ? fileId : String(fileId),
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
