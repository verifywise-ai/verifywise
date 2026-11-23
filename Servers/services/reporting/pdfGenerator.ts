/**
 * PDF Generator Service
 * Uses Playwright to render HTML and generate PDF
 * Following VerifyWise clean architecture patterns
 */

import { NOTICE_TEXT } from "./noticeText";
import { chromium, Browser, Page } from "playwright";
import * as ejs from "ejs";
import * as path from "path";
import * as fs from "fs";
import {
  ReportData,
  ReportGenerationResult,
} from "../../domain.layer/interfaces/i.reportGeneration";
import { ANALYSIS_LABELS } from "./analyzers/mapToSummaries";
import { applyColorTokens } from "../../tools/emailColors";
import { generateComplianceProgressChart } from "./chartUtils";

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

const escapeSvgText = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MAX_CHART_LABEL_CHARS = 55;

const truncateLabel = (value: string): string =>
  value.length > MAX_CHART_LABEL_CHARS ? `${value.slice(0, MAX_CHART_LABEL_CHARS - 1)}…` : value;

/**
 * One completeness-by-group bar chart per framework, in the order of
 * sections.frameworkRequirements.frameworks. The chart helper writes labels
 * into SVG unescaped and the template emits it raw, so group titles (user
 * text) are truncated to fit the chart and escaped here. When groups come from
 * several use case pairings (group.useCase set) the bars pool done/total per
 * group title across use cases, so the chart stays one bar per group however
 * many use cases there are; the tables keep the per-use-case detail. DOCX
 * embeds no charts, so it has no counterpart.
 */
export function buildFrameworkRequirementCharts(reportData: ReportData): string[] {
  const frameworks = reportData.sections.frameworkRequirements?.frameworks ?? [];
  return frameworks.map((fw) => {
    const bars = new Map<string, { done: number; total: number }>();
    fw.groups.forEach((group) => {
      const bar = bars.get(group.title) ?? { done: 0, total: 0 };
      bar.done += group.rollup.done;
      bar.total += group.rollup.total;
      bars.set(group.title, bar);
    });
    return generateComplianceProgressChart(
      Array.from(bars, ([title, { done, total }]) => ({
        category: escapeSvgText(truncateLabel(title)),
        completed: done,
        total,
        percentage: total > 0 ? Math.round((done / total) * 100) : 0,
      })),
      { width: 350, title: "Completeness by group" },
    );
  });
}

/**
 * Render EJS template to HTML string
 */
async function renderTemplate(reportData: ReportData): Promise<string> {
  const templatePath = path.join(__dirname, "../../templates/reports/report-pdf.ejs");

  // Read CSS files
  const pdfCssPath = path.join(__dirname, "../../templates/reports/styles/pdf.css");
  const pdfCss = applyColorTokens(fs.readFileSync(pdfCssPath, "utf-8"));

  const templateContent = applyColorTokens(fs.readFileSync(templatePath, "utf-8"));

  // Render with EJS
  const html = ejs.render(templateContent, {
    ...reportData,
    // One analyzer-label map, shared with docxGenerator.
    analysisLabels: ANALYSIS_LABELS,
    noticeText: NOTICE_TEXT,
    frameworkRequirementCharts: buildFrameworkRequirementCharts(reportData),
    // Include helper for CSS inclusion
    include: (filePath: string) => {
      if (filePath.includes("pdf.css")) {
        return pdfCss;
      }
      return "";
    },
  });

  return html;
}

/**
 * Generate PDF from report data
 */
export async function generatePDF(reportData: ReportData): Promise<ReportGenerationResult> {
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

    // Wait for any charts to render (if using client-side rendering)
    await page.waitForTimeout(500);

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

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${reportData.metadata.projectTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${reportData.metadata.frameworkName.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.pdf`;

    return {
      success: true,
      filename,
      content: Buffer.from(pdfBuffer),
      mimeType: "application/pdf",
    };
  } catch (error) {
    console.error("Error generating PDF:", error);
    return {
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Generate PDF with custom options
 */
export async function generatePDFWithOptions(
  reportData: ReportData,
  options: {
    format?: "A4" | "Letter";
    landscape?: boolean;
    scale?: number;
  } = {},
): Promise<ReportGenerationResult> {
  let page: Page | null = null;

  try {
    const html = await renderTemplate(reportData);

    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle",
    });

    await page.waitForTimeout(500);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: options.format || "A4",
      landscape: options.landscape || false,
      scale: options.scale || 1,
      margin: {
        top: "0.75in",
        right: "0.75in",
        bottom: "0.75in",
        left: "0.75in",
      },
      printBackground: true,
      displayHeaderFooter: false,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${reportData.metadata.projectTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.pdf`;

    return {
      success: true,
      filename,
      content: Buffer.from(pdfBuffer),
      mimeType: "application/pdf",
    };
  } catch (error) {
    console.error("Error generating PDF with options:", error);
    return {
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Screenshot a chart element for DOCX embedding
 * Used by DOCX generator to capture chart images
 */
export async function screenshotChart(html: string, selector: string): Promise<Buffer | null> {
  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle",
    });

    // Wait for chart to render
    await page.waitForTimeout(1000);

    const element = await page.$(selector);
    if (!element) {
      return null;
    }

    const screenshot = await element.screenshot({
      type: "png",
    });

    return Buffer.from(screenshot);
  } catch (error) {
    console.error("Error taking chart screenshot:", error);
    return null;
  } finally {
    if (page) {
      await page.close();
    }
  }
}
