/**
 * PMM PDF Generator Service
 *
 * Generates PDF reports for completed post-market monitoring cycles.
 * Uses Playwright to render HTML from EJS template and generate PDF.
 */

import { chromium, Browser, Page } from "playwright";
import * as ejs from "ejs";
import * as path from "path";
import * as fs from "fs";
import {
  IPMMReportData,
  IPMMContextSnapshot,
  IPMMResponseWithQuestion,
} from "../../domain.layer/interfaces/i.postMarketMonitoring";
import { uploadFile } from "../../utils/fileUpload.utils";
import logger from "../../utils/logger/fileLogger";

// Browser instance singleton for reuse
let browserInstance: Browser | null = null;

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      ...(executablePath ? { executablePath } : {}),
    });
  }
  return browserInstance;
}

/**
 * Close browser instance (for cleanup)
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Render EJS template to HTML string
 */
async function renderTemplate(reportData: IPMMReportData): Promise<string> {
  const templatePath = path.join(
    __dirname,
    "../../templates/reports/pmm-report.ejs"
  );

  const templateContent = fs.readFileSync(templatePath, "utf-8");

  // Render with EJS
  const html = ejs.render(templateContent, reportData);

  return html;
}

/**
 * Generate PDF buffer from report data
 */
export async function generatePMMPdfBuffer(
  reportData: IPMMReportData
): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
  let page: Page | null = null;

  try {
    // Render HTML template
    const html = await renderTemplate(reportData);

    // Get browser and create page
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set content
    await page.setContent(html, {
      waitUntil: "networkidle",
    });

    // Wait for any rendering to complete
    await page.waitForTimeout(300);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "0.75in",
        right: "0.75in",
        bottom: "0.75in",
        left: "0.75in",
      },
      printBackground: true,
      displayHeaderFooter: false,
    });

    return {
      success: true,
      buffer: Buffer.from(pdfBuffer),
    };
  } catch (error) {
    logger.error("Error generating PMM PDF:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Generate filename for PMM report
 */
function generateFilename(
  useCaseTitle: string,
  cycleNumber: number
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const sanitizedTitle = useCaseTitle.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 30);
  return `PMM_Report_${sanitizedTitle}_Cycle${cycleNumber}_${timestamp}.pdf`;
}

/**
 * Build report data from cycle information
 */
export function buildPMMReportData(
  organizationName: string,
  organizationLogo: string | undefined,
  useCaseTitle: string,
  useCaseId: string,
  cycleNumber: number,
  completedAt: Date,
  completedBy: string,
  context: IPMMContextSnapshot,
  responses: IPMMResponseWithQuestion[],
  primaryColor?: string
): IPMMReportData {
  // Extract unique EU AI Act articles from responses
  const articles = new Set<string>();
  responses.forEach((r) => {
    if (r.eu_ai_act_article) {
      articles.add(r.eu_ai_act_article);
    }
  });

  return {
    metadata: {
      organization_name: organizationName,
      organization_logo: organizationLogo,
      use_case_title: useCaseTitle,
      use_case_id: useCaseId,
      cycle_number: cycleNumber,
      completed_at: completedAt,
      completed_by: completedBy,
      eu_ai_act_articles: Array.from(articles),
    },
    context,
    responses: responses.map((r) => ({
      question: r.question_text,
      question_type: r.question_type,
      response: r.response_value,
      is_flagged: r.is_flagged,
      suggestion_text: r.suggestion_text,
      eu_ai_act_article: r.eu_ai_act_article,
    })),
    branding: {
      primary_color: primaryColor,
    },
  };
}

/**
 * Generate and upload PMM PDF report
 */
export async function generateAndUploadPMMReport(
  reportData: IPMMReportData,
  userId: number,
  projectId: number,
  organizationId: number
): Promise<{ success: boolean; fileId?: number; filename?: string; error?: string }> {
  try {
    // Generate PDF buffer
    const result = await generatePMMPdfBuffer(reportData);

    if (!result.success || !result.buffer) {
      return {
        success: false,
        error: result.error || "Failed to generate PDF",
      };
    }

    // Generate filename
    const filename = generateFilename(
      reportData.metadata.use_case_title,
      reportData.metadata.cycle_number
    );

    // Create file object for upload
    const fileObj = {
      originalname: filename,
      buffer: result.buffer,
      fieldname: "file",
      mimetype: "application/pdf",
    };

    // Upload file using existing file upload utility
    const uploadedFile = await uploadFile(
      fileObj,
      userId,
      projectId,
      "Post-Market Monitoring report",
      organizationId
    );

    return {
      success: true,
      fileId: uploadedFile.id,
      filename: uploadedFile.filename,
    };
  } catch (error) {
    logger.error("Error generating and uploading PMM report:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate PMM report as downloadable buffer (without uploading)
 */
export async function generatePMMReportForDownload(
  reportData: IPMMReportData
): Promise<{
  success: boolean;
  buffer?: Buffer;
  filename?: string;
  mimeType?: string;
  error?: string;
}> {
  try {
    const result = await generatePMMPdfBuffer(reportData);

    if (!result.success || !result.buffer) {
      return {
        success: false,
        error: result.error || "Failed to generate PDF",
      };
    }

    const filename = generateFilename(
      reportData.metadata.use_case_title,
      reportData.metadata.cycle_number
    );

    return {
      success: true,
      buffer: result.buffer,
      filename,
      mimeType: "application/pdf",
    };
  } catch (error) {
    logger.error("Error generating PMM report for download:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
