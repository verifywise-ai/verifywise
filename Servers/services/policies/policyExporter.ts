/**
 * @fileoverview Policy Export Service
 *
 * Generates PDF and DOCX exports from policy data.
 * Uses Playwright for PDF generation and docx library for Word documents.
 *
 * @module services/policies/policyExporter
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  HeadingLevel,
  convertInchesToTwip,
} from "docx";
import { chromium, Browser } from "playwright";
import { getFileById } from "../../repositories/file.repository";
import { JSDOM } from "jsdom";

// VerifyWise theme colors
const COLORS = {
  PRIMARY: "13715B",
  TEXT_DARK: "1A1919",
  TEXT_LIGHT: "667085",
  BORDER: "D0D5DD",
  BACKGROUND_LIGHT: "F9FAFB",
};

// Browser instance singleton for PDF generation
let browserInstance: Browser | null = null;

/**
 * Get or create browser instance for PDF generation
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserInstance;
}

/**
 * Close browser instance (call on server shutdown)
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Fetch image from file manager and return as base64
 */
async function fetchImageAsBase64(
  fileId: string,
  organizationId: number
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const fileIdNum = parseInt(fileId, 10);
    if (isNaN(fileIdNum)) return null;

    const file = await getFileById(fileIdNum, organizationId);
    if (!file || !file.content) return null;

    const base64 = file.content.toString("base64");
    const mimeType = file.type || "image/png";

    return { base64, mimeType };
  } catch (error) {
    console.error(`Failed to fetch image ${fileId}:`, error);
    return null;
  }
}

/**
 * Process HTML content and replace file-manager URLs with base64 data URLs
 */
async function processImagesInHtml(
  html: string,
  organizationId: number
): Promise<string> {
  // Match file-manager URLs: /api/file-manager/123 or similar patterns
  const imgRegex = /<img[^>]+src=["']([^"']*\/api\/file-manager\/(\d+)[^"']*)["'][^>]*>/gi;

  let processedHtml = html;
  const matches: RegExpExecArray[] = [];

  // Collect all matches first to avoid issues with exec on global regex
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    matches.push([...match] as unknown as RegExpExecArray);
  }

  // Process each match
  for (const matchArr of matches) {
    const fullMatch = matchArr[0];
    const fileId = matchArr[2];

    const imageData = await fetchImageAsBase64(fileId, organizationId);
    if (imageData) {
      const dataUrl = `data:${imageData.mimeType};base64,${imageData.base64}`;
      const newImgTag = fullMatch.replace(matchArr[1], dataUrl);
      processedHtml = processedHtml.replace(fullMatch, newImgTag);
    }
  }

  return processedHtml;
}

/**
 * Generate PDF from policy content
 */
export async function generatePolicyPDF(
  title: string,
  contentHtml: string,
  organizationId: number
): Promise<Buffer> {
  // Process images - replace file-manager URLs with base64
  const processedHtml = await processImagesInHtml(contentHtml, organizationId);

  // Build full HTML document with styling
  const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #${COLORS.TEXT_DARK};
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }

    .header {
      border-bottom: 2px solid #${COLORS.PRIMARY};
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .header h1 {
      color: #${COLORS.PRIMARY};
      font-size: 24pt;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .header .meta {
      color: #${COLORS.TEXT_LIGHT};
      font-size: 10pt;
    }

    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 12px;
      font-weight: 600;
    }

    h1 { font-size: 20pt; color: #${COLORS.PRIMARY}; }
    h2 { font-size: 16pt; color: #${COLORS.TEXT_DARK}; }
    h3 { font-size: 14pt; color: #${COLORS.TEXT_DARK}; }
    h4 { font-size: 12pt; color: #${COLORS.TEXT_DARK}; }

    p {
      margin-bottom: 12px;
    }

    ul, ol {
      margin-bottom: 12px;
      padding-left: 24px;
    }

    li {
      margin-bottom: 4px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }

    th, td {
      border: 1px solid #${COLORS.BORDER};
      padding: 8px 12px;
      text-align: left;
    }

    th {
      background-color: #${COLORS.BACKGROUND_LIGHT};
      font-weight: 600;
    }

    img {
      max-width: 100%;
      height: auto;
      margin: 12px 0;
    }

    blockquote {
      border-left: 4px solid #${COLORS.PRIMARY};
      padding-left: 16px;
      margin: 16px 0;
      color: #${COLORS.TEXT_LIGHT};
      font-style: italic;
    }

    code {
      background-color: #${COLORS.BACKGROUND_LIGHT};
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 11pt;
    }

    pre {
      background-color: #${COLORS.BACKGROUND_LIGHT};
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 12px 0;
    }

    pre code {
      padding: 0;
      background: none;
    }

    a {
      color: #${COLORS.PRIMARY};
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Generated on ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}</div>
  </div>

  <div class="content">
    ${processedHtml}
  </div>
</body>
</html>
  `;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(fullHtml, { waitUntil: "networkidle" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
      printBackground: true,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

/**
 * Parse HTML and convert to DOCX elements
 */
async function parseHtmlToDocxElements(
  html: string,
  organizationId: number
): Promise<(Paragraph | Table)[]> {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const elements: (Paragraph | Table)[] = [];

  async function processNode(node: Node): Promise<void> {
    if (node.nodeType === 3) {
      // Text node
      const text = node.textContent?.trim();
      if (text) {
        elements.push(
          new Paragraph({
            children: [new TextRun({ text })],
          })
        );
      }
      return;
    }

    if (node.nodeType !== 1) return; // Not an element

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    switch (tagName) {
      case "h1":
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: element.textContent || "",
                bold: true,
                size: 48, // 24pt
                color: COLORS.PRIMARY,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          })
        );
        break;

      case "h2":
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: element.textContent || "",
                bold: true,
                size: 36, // 18pt
                color: COLORS.TEXT_DARK,
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 320, after: 160 },
          })
        );
        break;

      case "h3":
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: element.textContent || "",
                bold: true,
                size: 28, // 14pt
                color: COLORS.TEXT_DARK,
              }),
            ],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 280, after: 120 },
          })
        );
        break;

      case "h4":
      case "h5":
      case "h6":
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: element.textContent || "",
                bold: true,
                size: 24, // 12pt
                color: COLORS.TEXT_DARK,
              }),
            ],
            heading: HeadingLevel.HEADING_4,
            spacing: { before: 240, after: 100 },
          })
        );
        break;

      case "p":
        const pChildren = await parseInlineElements(element, organizationId);
        if (pChildren.length > 0) {
          elements.push(
            new Paragraph({
              children: pChildren,
              spacing: { after: 200 },
            })
          );
        }
        break;

      case "ul":
      case "ol":
        const listItems = element.querySelectorAll(":scope > li");
        for (let i = 0; i < listItems.length; i++) {
          const li = listItems[i];
          const liChildren = await parseInlineElements(li, organizationId);
          elements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: tagName === "ul" ? "• " : `${i + 1}. `,
                }),
                ...liChildren,
              ],
              indent: { left: convertInchesToTwip(0.25) },
              spacing: { after: 80 },
            })
          );
        }
        break;

      case "table":
        const tableElement = await parseTable(element, organizationId);
        if (tableElement) {
          // Add spacing before table
          elements.push(createTableSpacing());
          elements.push(tableElement);
        }
        break;

      case "blockquote":
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: element.textContent || "",
                italics: true,
                color: COLORS.TEXT_LIGHT,
              }),
            ],
            indent: { left: convertInchesToTwip(0.5) },
            border: {
              left: {
                color: COLORS.PRIMARY,
                size: 12,
                style: BorderStyle.SINGLE,
                space: 10,
              },
            },
            spacing: { before: 200, after: 200 },
          })
        );
        break;

      case "img":
        const imgElement = await parseImage(element, organizationId);
        if (imgElement) {
          elements.push(imgElement);
        }
        break;

      case "div":
      case "section":
      case "article":
      case "span":
      case "tbody":
      case "thead":
      case "tfoot":
        // Process children recursively
        for (const child of Array.from(element.childNodes)) {
          await processNode(child);
        }
        break;

      default:
        // Check if this element contains tables or images that need to be extracted
        const nestedTables = element.querySelectorAll("table");
        const nestedImages = element.querySelectorAll("img");

        if (nestedTables.length > 0 || nestedImages.length > 0) {
          // Process nested tables
          for (const nestedTable of Array.from(nestedTables)) {
            const tableElement = await parseTable(nestedTable, organizationId);
            if (tableElement) {
              // Add spacing before table
              elements.push(createTableSpacing());
              elements.push(tableElement);
            }
          }
          // Process nested images
          for (const nestedImg of Array.from(nestedImages)) {
            const imgElement = await parseImage(nestedImg, organizationId);
            if (imgElement) {
              elements.push(imgElement);
            }
          }
        } else {
          // For other elements, try to get text content
          const text = element.textContent?.trim();
          if (text) {
            elements.push(
              new Paragraph({
                children: [new TextRun({ text })],
              })
            );
          }
        }
    }
  }

  // Process all top-level nodes
  for (const child of Array.from(document.body.childNodes)) {
    await processNode(child);
  }

  return elements;
}

/**
 * Parse inline elements (bold, italic, links, etc.)
 */
async function parseInlineElements(
  element: Element,
  _organizationId: number
): Promise<TextRun[]> {
  const runs: TextRun[] = [];

  function processInline(node: Node, styles: {
    bold?: boolean;
    italics?: boolean;
    underline?: object;
    color?: string;
  } = {}): void {
    if (node.nodeType === 3) {
      // Text node
      const text = node.textContent;
      if (text) {
        runs.push(new TextRun({ text, ...styles }));
      }
      return;
    }

    if (node.nodeType !== 1) return;

    const el = node as Element;
    const tagName = el.tagName.toLowerCase();

    let newStyles = { ...styles };

    switch (tagName) {
      case "strong":
      case "b":
        newStyles.bold = true;
        break;
      case "em":
      case "i":
        newStyles.italics = true;
        break;
      case "u":
        newStyles.underline = {};
        break;
      case "a":
        newStyles.color = COLORS.PRIMARY;
        newStyles.underline = {};
        break;
      case "code":
        // Code styling - just use text with different font would require more complex handling
        break;
    }

    for (const child of Array.from(el.childNodes)) {
      processInline(child, newStyles);
    }
  }

  for (const child of Array.from(element.childNodes)) {
    processInline(child);
  }

  return runs;
}

/**
 * Parse table element to DOCX Table
 */
async function parseTable(
  tableEl: Element,
  _organizationId: number
): Promise<Table | null> {
  console.log("Processing table element");
  const rows: TableRow[] = [];

  // Get all rows, including those in thead, tbody, tfoot
  const tableRows = tableEl.querySelectorAll("tr");
  console.log(`Found ${tableRows.length} table rows`);

  for (const tr of Array.from(tableRows)) {
    const cells: TableCell[] = [];
    const tableCells = tr.querySelectorAll("th, td");

    for (const cell of Array.from(tableCells)) {
      const isHeader = cell.tagName.toLowerCase() === "th";
      const cellText = cell.textContent?.trim() || "";

      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cellText,
                  bold: isHeader,
                }),
              ],
            }),
          ],
          shading: isHeader
            ? { fill: COLORS.BACKGROUND_LIGHT }
            : undefined,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER },
            left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER },
            right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER },
          },
        })
      );
    }

    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  }

  if (rows.length === 0) {
    console.log("No rows found in table, skipping");
    return null;
  }

  console.log(`Created table with ${rows.length} rows`);
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Create a spacing paragraph before tables
 */
function createTableSpacing(): Paragraph {
  return new Paragraph({
    children: [],
    spacing: { before: 200, after: 0 },
  });
}

/**
 * Get image dimensions from buffer by reading image header
 */
function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    // Check for PNG signature
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // Check for JPEG signature
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      // JPEG: need to find SOF0 marker (0xFFC0) or similar
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xFF) {
          const marker = buffer[offset + 1];
          // SOF0, SOF1, SOF2 markers contain dimensions
          if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
          // Skip to next marker
          const segmentLength = buffer.readUInt16BE(offset + 2);
          offset += 2 + segmentLength;
        } else {
          offset++;
        }
      }
    }

    // Check for GIF signature
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      // GIF: width at bytes 6-7, height at bytes 8-9 (little-endian)
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return { width, height };
    }

    return null;
  } catch (error) {
    console.error("Error reading image dimensions:", error);
    return null;
  }
}

/**
 * Parse image element to DOCX ImageRun wrapped in Paragraph
 */
async function parseImage(
  imgEl: Element,
  organizationId: number
): Promise<Paragraph | null> {
  const src = imgEl.getAttribute("src");
  if (!src) {
    console.log("Image element has no src attribute");
    return null;
  }

  console.log("Processing image with src:", src.substring(0, 100) + "...");

  let imageBuffer: Buffer | null = null;

  // Check if it's a file-manager URL (various patterns)
  const fileManagerMatch = src.match(/\/api\/file-manager\/(\d+)/) ||
                           src.match(/file-manager\/(\d+)/) ||
                           src.match(/\/files\/(\d+)/);

  if (fileManagerMatch) {
    console.log("Matched file-manager URL, fileId:", fileManagerMatch[1]);
    const imageData = await fetchImageAsBase64(fileManagerMatch[1], organizationId);
    if (imageData) {
      imageBuffer = Buffer.from(imageData.base64, "base64");
      console.log("Successfully fetched image from file-manager");
    } else {
      console.log("Failed to fetch image from file-manager");
    }
  } else if (src.startsWith("data:")) {
    // Base64 data URL
    console.log("Processing base64 data URL");
    const base64Match = src.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (base64Match) {
      imageBuffer = Buffer.from(base64Match[1], "base64");
      console.log("Successfully decoded base64 image");
    }
  } else {
    console.log("Unknown image source format, cannot process");
  }

  if (!imageBuffer) {
    console.log("No image buffer created, skipping image");
    return null;
  }

  try {
    // Try to get actual image dimensions from the image data
    let width = 0;
    let height = 0;

    const actualDimensions = getImageDimensions(imageBuffer);
    if (actualDimensions) {
      width = actualDimensions.width;
      height = actualDimensions.height;
      console.log(`Detected actual image dimensions: ${width}x${height}`);
    }

    // If no dimensions from image data, try HTML attributes
    if (width === 0 || height === 0) {
      width = parseInt(imgEl.getAttribute("width") || "0", 10);
      height = parseInt(imgEl.getAttribute("height") || "0", 10);
    }

    // Try to get dimensions from style attribute if still not set
    if (width === 0 || height === 0) {
      const style = imgEl.getAttribute("style") || "";
      const widthMatch = style.match(/width:\s*(\d+)px/);
      const heightMatch = style.match(/height:\s*(\d+)px/);
      if (widthMatch) width = parseInt(widthMatch[1], 10);
      if (heightMatch) height = parseInt(heightMatch[1], 10);
    }

    // Use defaults if still no dimensions (shouldn't happen with actual image parsing)
    if (width === 0) width = 400;
    if (height === 0) height = 300;

    // Scale down if too large, maintaining aspect ratio
    const maxWidth = 500;
    if (width > maxWidth) {
      const scale = maxWidth / width;
      width = maxWidth;
      height = Math.round(height * scale);
    }

    console.log(`Creating image with dimensions: ${width}x${height}`);

    return new Paragraph({
      children: [
        new ImageRun({
          data: imageBuffer,
          transformation: { width, height },
          type: "png",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
    });
  } catch (error) {
    console.error("Failed to create image run:", error);
    return null;
  }
}

/**
 * Generate DOCX from policy content
 */
export async function generatePolicyDOCX(
  title: string,
  contentHtml: string,
  organizationId: number
): Promise<Buffer> {
  console.log("Generating DOCX for policy:", title);
  console.log("Content HTML length:", contentHtml.length);
  console.log("Content HTML preview:", contentHtml.substring(0, 500));

  // Parse HTML content to DOCX elements
  const contentElements = await parseHtmlToDocxElements(contentHtml, organizationId);
  console.log("Generated", contentElements.length, "DOCX elements");

  // Build document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 24, // 12pt
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children: [
          // Title
          new Paragraph({
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 56, // 28pt
                color: COLORS.PRIMARY,
              }),
            ],
            spacing: { after: 200 },
          }),
          // Meta line
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated on ${new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}`,
                size: 20, // 10pt
                color: COLORS.TEXT_LIGHT,
              }),
            ],
            spacing: { after: 400 },
            border: {
              bottom: {
                color: COLORS.PRIMARY,
                size: 12,
                style: BorderStyle.SINGLE,
                space: 10,
              },
            },
          }),
          // Content
          ...contentElements,
          // Footer
          new Paragraph({
            children: [
              new TextRun({
                text: "Generated by VerifyWise",
                size: 18, // 9pt
                color: COLORS.TEXT_LIGHT,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 600 },
            border: {
              top: {
                color: COLORS.BORDER,
                size: 4,
                style: BorderStyle.SINGLE,
                space: 10,
              },
            },
          }),
        ],
      },
    ],
  });

  // Generate buffer
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Generate sanitized filename from title
 */
export function generateFilename(
  title: string,
  extension: "pdf" | "docx"
): string {
  const sanitized = title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);

  const date = new Date().toISOString().split("T")[0];
  return `${sanitized}_${date}.${extension}`;
}
