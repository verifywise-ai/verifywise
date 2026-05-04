import { useCallback } from "react";
import { getAITrustCentreLogo } from "../repository/aiTrustCentre.repository";

/**
 * Custom hook for fetching and converting logo data to blob URL
 * Handles different response formats and auto-detects SVG MIME types
 *
 * @returns Object containing the fetchLogoAsBlobUrl function
 */
export const useLogoFetch = () => {
  const fetchLogoAsBlobUrl = useCallback(async (tenantId: string): Promise<string | null> => {
    try {
      const responseData = await getAITrustCentreLogo(tenantId);
      if (responseData?.data?.logo?.content) {
        const logoData = responseData.data.logo;
        let bufferData: Uint8Array;
        let mimeType: string;

        // Handle different response formats
        if (
          logoData.content instanceof ArrayBuffer ||
          (Array.isArray(logoData.content) && logoData.content.length > 0)
        ) {
          bufferData = new Uint8Array(logoData.content);
          mimeType = logoData.type || "image/png";
        } else if (logoData.content.data) {
          bufferData = new Uint8Array(logoData.content.data);
          mimeType = logoData.mimeType || logoData.contentType || "image/png";
        } else {
          return null;
        }

        // Auto-detect and fix SVG MIME type
        if (mimeType === "image/png" && bufferData.length > 0) {
          const svgSignature = new TextDecoder().decode(bufferData.slice(0, 20));
          if (svgSignature.includes("<?xml") || svgSignature.includes("<svg")) {
            mimeType = "image/svg+xml";
          }
        }

        const blob = new Blob([bufferData as BlobPart], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);

        // Validate image loading
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(blobUrl);
          img.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            resolve(null);
          };
          img.src = blobUrl;
        });
      }
      return null;
    } catch (_error) {
      return null;
    }
  }, []);

  return { fetchLogoAsBlobUrl };
};
