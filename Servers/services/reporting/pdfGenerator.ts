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
import { buildE23FormalView } from "./e23/formalView";
import { buildE23FixItView, type E23FixItView } from "./e23/fixItView";
import { E23_NOTICE_LABELS } from "./e23/e23Text";

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

const TEMPLATES_DIR = path.join(__dirname, "../../templates/reports");

const readTemplate = (relativePath: string): string =>
  applyColorTokens(fs.readFileSync(path.join(TEMPLATES_DIR, relativePath), "utf-8"));

/**
 * Render the report template to an HTML string. Synchronous and free of
 * Playwright, so tests render exactly what the PDF is printed from.
 *
 * An OSFI E-23 kind run also gets `e23` (its formal-report content, see
 * e23/formalView.ts), its stylesheet and `e23Partial` for the E-23 blocks in
 * templates/reports/partials/e23. A general report gets none of them, so its
 * HTML is exactly what it was before the E-23 report existed.
 */
export function renderReportHtml(reportData: ReportData): string {
  const pdfCss = readTemplate("styles/pdf.css");
  const templateContent = readTemplate("report-pdf.ejs");
  const e23 = buildE23FormalView(reportData);

  const data: Record<string, unknown> = {
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
      if (e23 && filePath.includes("e23.css")) {
        return readTemplate("styles/e23.css");
      }
      return "";
    },
  };
  if (e23) {
    data.e23 = e23;
    data.aiSummaries = e23.aiSummaries;
    data.e23NoticeLabels = E23_NOTICE_LABELS;
    data.e23Partial = (name: string, locals: Record<string, unknown> = {}) =>
      ejs.render(readTemplate(`partials/e23/${name}.ejs`), { ...data, ...locals });
  }

  return ejs.render(templateContent, data);
}

const PAGE_MARGIN = { top: "0.75in", right: "0.75in", bottom: "0.75in", left: "0.75in" };

/**
 * Print HTML to an A4 PDF. With a footer template, Chromium prints it in the
 * bottom margin of every page.
 */
async function printPdf(html: string, footerTemplate?: string): Promise<Buffer> {
  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    // Wait for any charts to render (if using client-side rendering)
    await page.waitForTimeout(500);
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: PAGE_MARGIN,
      printBackground: true,
      ...(footerTemplate
        ? { displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate }
        : { displayHeaderFooter: false }),
    });
    return Buffer.from(pdfBuffer);
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Generate PDF from report data
 */
export async function generatePDF(reportData: ReportData): Promise<ReportGenerationResult> {
  try {
    const content = await printPdf(renderReportHtml(reportData));

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${reportData.metadata.projectTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${reportData.metadata.frameworkName.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.pdf`;

    return {
      success: true,
      filename,
      content,
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
  }
}

/**
 * The internal E-23 fix-it list's HTML (e23-fixit-pdf.ejs). Synchronous and
 * free of Playwright, like renderReportHtml, so tests render what is printed.
 */
export function renderFixItHtml(reportData: ReportData, fixIt: E23FixItView): string {
  const data: Record<string, unknown> = {
    branding: reportData.branding,
    fixIt,
    include: (filePath: string) => {
      if (filePath.includes("pdf.css")) return readTemplate("styles/pdf.css");
      if (filePath.includes("e23.css")) return readTemplate("styles/e23.css");
      return "";
    },
  };
  data.e23Partial = (name: string, locals: Record<string, unknown> = {}) =>
    ejs.render(readTemplate(`partials/e23/${name}.ejs`), { ...data, ...locals });
  return ejs.render(readTemplate("e23-fixit-pdf.ejs"), data);
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * The fix-it list's page footer: the internal marking and the page number,
 * printed by Chromium on every page. Its styles must be inline and carry a
 * font size; the footer does not see the page's stylesheet.
 */
export function fixItFooterTemplate(fixIt: E23FixItView): string {
  return applyColorTokens(
    `<div style="width: 100%; box-sizing: border-box; padding: 0 0.75in; font-family: Arial, sans-serif; font-size: 8px; color: {{colorTextSecondary}};">` +
      `<div style="display: flex; justify-content: space-between; gap: 16px; padding-top: 4px; border-top: 1px solid {{colorBorderLight}};">` +
      `<span style="font-weight: 700;">${escapeHtml(fixIt.footerText)}</span>` +
      `<span style="white-space: nowrap;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
      `</div></div>`,
  );
}

/**
 * The internal E-23 fix-it list as a PDF (spec 8.6). The caller names the
 * file after the formal report; the filename here is a fallback.
 */
export async function generateFixItPDF(
  reportData: ReportData,
  runId?: number,
): Promise<ReportGenerationResult> {
  try {
    const fixIt = buildE23FixItView(reportData, { runId });
    if (!fixIt) throw new Error("the fix-it list belongs to an OSFI E-23 report");
    const content = await printPdf(renderFixItHtml(reportData, fixIt), fixItFooterTemplate(fixIt));
    return {
      success: true,
      filename: "fix-it-list.pdf",
      content,
      mimeType: "application/pdf",
    };
  } catch (error) {
    console.error("Error generating fix-it list PDF:", error);
    return {
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
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
    const html = renderReportHtml(reportData);

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
