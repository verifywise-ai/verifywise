/**
 * @jest-environment jsdom
 */

/**
 * @fileoverview Policy Exporter Tests
 *
 * Covers all four exported functions: generateFilename, generatePolicyPDF,
 * generatePolicyDOCX and closeBrowser.
 *
 * Playwright is mocked (following services/reporting/tests/pdfGenerator.spec.ts);
 * the docx library is NOT mocked — DOCX output is generated for real and
 * inspected by unzipping document.xml (following docxGenerator.spec.ts).
 *
 * @module tests/policyExporter
 */

const mockPage = {
  setContent: jest.fn(),
  pdf: jest.fn(),
  close: jest.fn(),
};

const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  isConnected: jest.fn().mockReturnValue(true),
  close: jest.fn(),
};

const mockLaunch = jest.fn().mockResolvedValue(mockBrowser);

jest.mock("playwright", () => ({
  chromium: {
    get launch() {
      return mockLaunch;
    },
  },
}));

// jest.config.js maps "^jsdom$" to a bare stub for the integration suite, so
// `new JSDOM(html).window.document` has no body and the DOCX parser cannot walk
// it. Real jsdom cannot be required back in — its ESM-only dependency chain
// (@exodus/bytes → parse5 → entities → whatwg-url) does not survive Jest's
// transform. Instead this file runs in the jsdom test environment (see the
// docblock above) and backs JSDOM with that environment's own DOMParser, which
// is a real DOM.
jest.mock("jsdom", () => ({
  JSDOM: class {
    window: { document: Document };

    constructor(html: string) {
      this.window = { document: new DOMParser().parseFromString(html, "text/html") };
    }
  },
}));

const mockGetFileById = jest.fn();

jest.mock("../../../repositories/file.repository", () => ({
  getFileById: (...args: unknown[]) => mockGetFileById(...args),
}));

import { TextEncoder, TextDecoder } from "util";
import JSZip from "jszip";
import {
  generateFilename,
  generatePolicyPDF,
  generatePolicyDOCX,
  closeBrowser,
} from "../policyExporter";

// The jsdom test environment does not expose Node's text encoders, which docx
// needs when packing the document.
Object.assign(globalThis, { TextEncoder, TextDecoder });

/** Visible text of a generated DOCX, one run per line. */
async function docxText(content: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(content);
  const xml = await zip.file("word/document.xml")!.async("string");
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("\n");
}

/** Raw document.xml, for asserting on OOXML elements docxText discards. */
async function docxXml(content: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(content);
  return zip.file("word/document.xml")!.async("string");
}

/** Minimal JPEG carrying an SOF0 segment with the given dimensions. */
function jpegBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(20, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8; // SOI
  buffer[2] = 0xff;
  buffer[3] = 0xe0; // APP0
  buffer.writeUInt16BE(4, 4); // APP0 segment length
  buffer[8] = 0xff;
  buffer[9] = 0xc0; // SOF0
  buffer.writeUInt16BE(11, 10); // SOF0 segment length
  buffer.writeUInt16BE(height, 13);
  buffer.writeUInt16BE(width, 15);
  return buffer;
}

/** Minimal GIF header carrying the given dimensions. */
function gifBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(16, 0);
  buffer.write("GIF89a", 0, "binary");
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

/** Minimal valid PNG header carrying the given dimensions. */
function pngBuffer(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.write("\x89PNG\r\n\x1a\n", 0, "binary");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe("policyExporter", () => {
  describe("generateFilename", () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-03-15T12:00:00Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("appends the current ISO date to the sanitized title", () => {
      expect(generateFilename("Data Retention Policy", "pdf")).toBe(
        "Data_Retention_Policy_2026-03-15.pdf",
      );
    });

    it("uses the docx extension when requested", () => {
      expect(generateFilename("Data Retention Policy", "docx")).toBe(
        "Data_Retention_Policy_2026-03-15.docx",
      );
    });

    it("strips characters that aren't alphanumeric, whitespace, or hyphens", () => {
      expect(generateFilename("Policy: GDPR & CCPA (2026)!", "pdf")).toBe(
        "Policy_GDPR_CCPA_2026_2026-03-15.pdf",
      );
    });

    it("collapses runs of whitespace into a single underscore", () => {
      expect(generateFilename("Multi   Word    Title", "pdf")).toBe(
        "Multi_Word_Title_2026-03-15.pdf",
      );
    });

    it("preserves hyphens in the title", () => {
      expect(generateFilename("Data-Sharing Policy", "pdf")).toBe(
        "Data-Sharing_Policy_2026-03-15.pdf",
      );
    });

    it("truncates the sanitized title to 50 characters before appending the date", () => {
      const longTitle = "A".repeat(80);
      const result = generateFilename(longTitle, "pdf");

      expect(result).toBe(`${"A".repeat(50)}_2026-03-15.pdf`);
    });

    it("returns just the date and extension when the title sanitizes to empty", () => {
      expect(generateFilename("!!!???", "pdf")).toBe("_2026-03-15.pdf");
    });
  });
  describe("generatePolicyPDF", () => {
    beforeEach(async () => {
      await closeBrowser();
      jest.clearAllMocks();
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockBrowser.isConnected.mockReturnValue(true);
      mockLaunch.mockResolvedValue(mockBrowser);
      mockPage.pdf.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
    });

    it("returns the buffer produced by the page", async () => {
      const result = await generatePolicyPDF("Security Policy", "<p>Body</p>", 1);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe("%PDF-1.4 fake");
    });

    it("launches a headless browser with the sandbox flags", async () => {
      await generatePolicyPDF("Security Policy", "<p>Body</p>", 1);

      expect(mockLaunch).toHaveBeenCalledWith({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    });

    it("renders the title and content into the page HTML", async () => {
      await generatePolicyPDF("Security Policy", "<p>Distinctive body text</p>", 1);

      const [html, options] = mockPage.setContent.mock.calls[0];
      expect(html).toContain("<h1>Security Policy</h1>");
      expect(html).toContain("<p>Distinctive body text</p>");
      expect(options).toEqual({ waitUntil: "networkidle" });
    });

    it("escapes HTML special characters in the title", async () => {
      await generatePolicyPDF('Policy <script> & "quotes"', "<p>Body</p>", 1);

      const [html] = mockPage.setContent.mock.calls[0];
      expect(html).toContain("&lt;script&gt; &amp; &quot;quotes&quot;");
      expect(html).not.toContain("<h1>Policy <script>");
    });

    it("requests A4 output with 20mm margins and background printing", async () => {
      await generatePolicyPDF("Security Policy", "<p>Body</p>", 1);

      expect(mockPage.pdf).toHaveBeenCalledWith({
        format: "A4",
        margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
        printBackground: true,
      });
    });

    it("closes the page but leaves the browser open for reuse", async () => {
      await generatePolicyPDF("Security Policy", "<p>Body</p>", 1);

      expect(mockPage.close).toHaveBeenCalledTimes(1);
      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it("closes the page even when PDF rendering fails", async () => {
      mockPage.pdf.mockRejectedValue(new Error("render failed"));

      await expect(generatePolicyPDF("Security Policy", "<p>Body</p>", 1)).rejects.toThrow(
        "render failed",
      );
      expect(mockPage.close).toHaveBeenCalledTimes(1);
    });

    it("reuses the singleton browser across calls", async () => {
      await generatePolicyPDF("First", "<p>a</p>", 1);
      await generatePolicyPDF("Second", "<p>b</p>", 1);

      expect(mockLaunch).toHaveBeenCalledTimes(1);
      expect(mockBrowser.newPage).toHaveBeenCalledTimes(2);
    });

    it("relaunches the browser when the existing instance has disconnected", async () => {
      await generatePolicyPDF("First", "<p>a</p>", 1);
      mockBrowser.isConnected.mockReturnValue(false);

      await generatePolicyPDF("Second", "<p>b</p>", 1);

      expect(mockLaunch).toHaveBeenCalledTimes(2);
    });

    it("inlines file-manager images as base64 data URLs", async () => {
      mockGetFileById.mockResolvedValue({ content: Buffer.from("imagebytes"), type: "image/jpeg" });

      await generatePolicyPDF(
        "Security Policy",
        '<img src="/api/file-manager/42" alt="diagram">',
        7,
      );

      expect(mockGetFileById).toHaveBeenCalledWith(42, 7);
      const [html] = mockPage.setContent.mock.calls[0];
      expect(html).toContain(
        `data:image/jpeg;base64,${Buffer.from("imagebytes").toString("base64")}`,
      );
      expect(html).not.toContain('src="/api/file-manager/42"');
    });

    it("defaults the mime type to image/png when the file record has none", async () => {
      mockGetFileById.mockResolvedValue({ content: Buffer.from("imagebytes"), type: null });

      await generatePolicyPDF("Security Policy", '<img src="/api/file-manager/42">', 1);

      const [html] = mockPage.setContent.mock.calls[0];
      expect(html).toContain("data:image/png;base64,");
    });

    it("leaves the image tag untouched when the file cannot be found", async () => {
      mockGetFileById.mockResolvedValue(null);

      await generatePolicyPDF("Security Policy", '<img src="/api/file-manager/42">', 1);

      const [html] = mockPage.setContent.mock.calls[0];
      expect(html).toContain('src="/api/file-manager/42"');
    });

    it("leaves the image tag untouched when the file lookup throws", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
      mockGetFileById.mockRejectedValue(new Error("db down"));

      await generatePolicyPDF("Security Policy", '<img src="/api/file-manager/42">', 1);

      const [html] = mockPage.setContent.mock.calls[0];
      expect(html).toContain('src="/api/file-manager/42"');
      consoleError.mockRestore();
    });

    it("ignores images that are not file-manager URLs", async () => {
      await generatePolicyPDF("Security Policy", '<img src="https://example.com/a.png">', 1);

      expect(mockGetFileById).not.toHaveBeenCalled();
      const [html] = mockPage.setContent.mock.calls[0];
      expect(html).toContain('src="https://example.com/a.png"');
    });
  });

  describe("closeBrowser", () => {
    beforeEach(async () => {
      await closeBrowser();
      jest.clearAllMocks();
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockBrowser.isConnected.mockReturnValue(true);
      mockLaunch.mockResolvedValue(mockBrowser);
      mockPage.pdf.mockResolvedValue(Buffer.from("%PDF-1.4 fake"));
    });

    it("closes an open browser instance", async () => {
      await generatePolicyPDF("Security Policy", "<p>Body</p>", 1);

      await closeBrowser();

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when no browser has been launched", async () => {
      await expect(closeBrowser()).resolves.toBeUndefined();
      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it("clears the singleton so the next export launches a fresh browser", async () => {
      await generatePolicyPDF("First", "<p>a</p>", 1);
      await closeBrowser();
      await generatePolicyPDF("Second", "<p>b</p>", 1);

      expect(mockLaunch).toHaveBeenCalledTimes(2);
    });

    it("does not close twice when called repeatedly", async () => {
      await generatePolicyPDF("Security Policy", "<p>Body</p>", 1);

      await closeBrowser();
      await closeBrowser();

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("generatePolicyDOCX", () => {
    let consoleLog: jest.SpyInstance;

    beforeEach(() => {
      // generatePolicyDOCX and its HTML parser log progress on every call.
      consoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
      jest.clearAllMocks();
    });

    afterEach(() => {
      consoleLog.mockRestore();
    });

    it("returns a buffer holding a readable OOXML package", async () => {
      const result = await generatePolicyDOCX("Security Policy", "<p>Body</p>", 1);

      expect(Buffer.isBuffer(result)).toBe(true);
      await expect(docxText(result)).resolves.toContain("Body");
    });

    it("writes the title, generated-on line and footer", async () => {
      // Fake only the clock: docx packs asynchronously, so faking the timer
      // queue as well would leave Packer.toBuffer permanently pending.
      jest.useFakeTimers({
        doNotFake: ["setTimeout", "setImmediate", "nextTick", "queueMicrotask"],
      });
      jest.setSystemTime(new Date("2026-03-15T12:00:00Z"));

      try {
        const text = await docxText(await generatePolicyDOCX("Security Policy", "<p>Body</p>", 1));

        expect(text).toContain("Security Policy");
        expect(text).toContain("Generated on March 15, 2026");
        expect(text).toContain("Generated by VerifyWise");
      } finally {
        jest.useRealTimers();
      }
    });

    it("writes markup in the title as escaped document text, not as XML", async () => {
      const buffer = await generatePolicyDOCX('Policy <script> & "quotes"', "<p>Body</p>", 1);
      const xml = await docxXml(buffer);

      // The OOXML writer escapes run text, so a title carrying angle brackets
      // lands as entities inside <w:t> rather than as document.xml elements.
      expect(xml).toContain("Policy &lt;script&gt; &amp; &quot;quotes&quot;");
      expect(xml).not.toContain("<script>");
    });

    it("renders headings at the matching outline levels", async () => {
      const buffer = await generatePolicyDOCX(
        "Doc",
        "<h1>Top</h1><h2>Second</h2><h3>Third</h3><h4>Fourth</h4>",
        1,
      );

      const text = await docxText(buffer);
      const xml = await docxXml(buffer);

      expect(text).toContain("Top");
      expect(text).toContain("Second");
      expect(text).toContain("Third");
      expect(text).toContain("Fourth");
      expect(xml).toContain('w:val="Heading1"');
      expect(xml).toContain('w:val="Heading2"');
      expect(xml).toContain('w:val="Heading3"');
      expect(xml).toContain('w:val="Heading4"');
    });

    it("prefixes unordered list items with bullets", async () => {
      const text = await docxText(
        await generatePolicyDOCX("Doc", "<ul><li>Alpha</li><li>Beta</li></ul>", 1),
      );

      expect(text).toContain("• ");
      expect(text).toContain("Alpha");
      expect(text).toContain("Beta");
    });

    it("numbers ordered list items sequentially", async () => {
      const text = await docxText(
        await generatePolicyDOCX("Doc", "<ol><li>Alpha</li><li>Beta</li></ol>", 1),
      );

      expect(text).toContain("1. ");
      expect(text).toContain("2. ");
    });

    it("renders blockquotes", async () => {
      const text = await docxText(
        await generatePolicyDOCX("Doc", "<blockquote>Quoted line</blockquote>", 1),
      );

      expect(text).toContain("Quoted line");
    });

    it("renders table cells", async () => {
      const buffer = await generatePolicyDOCX(
        "Doc",
        "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>",
        1,
      );

      const text = await docxText(buffer);
      const xml = await docxXml(buffer);

      expect(text).toContain("Header");
      expect(text).toContain("Cell");
      expect(xml).toContain("<w:tbl>");
    });

    it("recurses into wrapper elements instead of flattening them to text", async () => {
      const text = await docxText(
        await generatePolicyDOCX(
          "Doc",
          "<div><section><p>First</p><p>Second</p></section></div>",
          1,
        ),
      );

      expect(text).toContain("First");
      expect(text).toContain("Second");
    });

    it("keeps bare text nodes at the top level", async () => {
      const text = await docxText(await generatePolicyDOCX("Doc", "Loose text", 1));

      expect(text).toContain("Loose text");
    });

    it("falls back to text content for unhandled elements", async () => {
      const text = await docxText(
        await generatePolicyDOCX("Doc", "<figure>Caption text</figure>", 1),
      );

      expect(text).toContain("Caption text");
    });

    it("extracts tables nested inside unhandled elements", async () => {
      const xml = await docxXml(
        await generatePolicyDOCX(
          "Doc",
          "<figure><table><tr><td>Nested cell</td></tr></table></figure>",
          1,
        ),
      );

      expect(xml).toContain("<w:tbl>");
      expect(xml).toContain("Nested cell");
    });

    it("embeds file-manager images", async () => {
      mockGetFileById.mockResolvedValue({ content: pngBuffer(120, 60), type: "image/png" });

      const buffer = await generatePolicyDOCX("Doc", '<img src="/api/file-manager/42">', 9);
      const zip = await JSZip.loadAsync(buffer);

      expect(mockGetFileById).toHaveBeenCalledWith(42, 9);
      expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(true);
    });

    it("skips images the file lookup cannot resolve", async () => {
      mockGetFileById.mockResolvedValue(null);

      const buffer = await generatePolicyDOCX("Doc", '<img src="/api/file-manager/42">', 1);
      const zip = await JSZip.loadAsync(buffer);

      expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(false);
    });

    it("skips image tags with no src", async () => {
      const buffer = await generatePolicyDOCX("Doc", "<img alt='no source'>", 1);
      const zip = await JSZip.loadAsync(buffer);

      expect(mockGetFileById).not.toHaveBeenCalled();
      expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(false);
    });

    it("carries bold, italic, underline and link styling into the run properties", async () => {
      const xml = await docxXml(
        await generatePolicyDOCX(
          "Doc",
          "<p><strong>Bold</strong><em>Italic</em><u>Under</u><a href='/x'>Link</a></p>",
          1,
        ),
      );

      expect(xml).toContain("<w:b/>");
      expect(xml).toContain("<w:i/>");
      expect(xml).toContain("<w:u ");
      expect(xml).toContain(`w:val="13715B"`);
    });

    it("nests inline styles cumulatively", async () => {
      const xml = await docxXml(
        await generatePolicyDOCX("Doc", "<p><strong><em>Both</em></strong></p>", 1),
      );

      // The run carrying "Both" must be both bold and italic.
      const run = xml.slice(0, xml.indexOf("Both"));
      expect(run.slice(run.lastIndexOf("<w:r>"))).toContain("<w:b/>");
      expect(run.slice(run.lastIndexOf("<w:r>"))).toContain("<w:i/>");
    });

    it("treats b/i aliases the same as strong/em", async () => {
      const xml = await docxXml(await generatePolicyDOCX("Doc", "<p><b>B</b><i>I</i></p>", 1));

      expect(xml).toContain("<w:b/>");
      expect(xml).toContain("<w:i/>");
    });

    it("keeps code spans as plain text", async () => {
      const text = await docxText(
        await generatePolicyDOCX("Doc", "<p><code>npm run build</code></p>", 1),
      );

      expect(text).toContain("npm run build");
    });

    it("drops paragraphs that contain no inline runs", async () => {
      const text = await docxText(await generatePolicyDOCX("Doc", "<p></p><p>Kept</p>", 1));

      expect(text).toContain("Kept");
    });

    it("embeds base64 data-URL images", async () => {
      const buffer = await generatePolicyDOCX(
        "Doc",
        `<img src="data:image/png;base64,${pngBuffer(100, 50).toString("base64")}">`,
        1,
      );
      const zip = await JSZip.loadAsync(buffer);

      expect(mockGetFileById).not.toHaveBeenCalled();
      expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(true);
    });

    it("skips malformed data URLs", async () => {
      const buffer = await generatePolicyDOCX("Doc", '<img src="data:image/png,notbase64">', 1);
      const zip = await JSZip.loadAsync(buffer);

      expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(false);
    });

    it("skips images with an unrecognised source scheme", async () => {
      const buffer = await generatePolicyDOCX("Doc", '<img src="https://example.com/a.png">', 1);
      const zip = await JSZip.loadAsync(buffer);

      expect(mockGetFileById).not.toHaveBeenCalled();
      expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(false);
    });

    it("reads dimensions out of JPEG and GIF headers", async () => {
      mockGetFileById.mockResolvedValueOnce({ content: jpegBuffer(80, 40), type: "image/jpeg" });
      const jpegXml = await docxXml(
        await generatePolicyDOCX("Doc", '<img src="/api/file-manager/1">', 1),
      );

      mockGetFileById.mockResolvedValueOnce({ content: gifBuffer(60, 30), type: "image/gif" });
      const gifXml = await docxXml(
        await generatePolicyDOCX("Doc", '<img src="/api/file-manager/2">', 1),
      );

      // 80x40 px and 60x30 px in EMU (914400 per inch / 96 px per inch = 9525).
      expect(jpegXml).toContain(`cx="${80 * 9525}"`);
      expect(jpegXml).toContain(`cy="${40 * 9525}"`);
      expect(gifXml).toContain(`cx="${60 * 9525}"`);
      expect(gifXml).toContain(`cy="${30 * 9525}"`);
    });

    it("falls back to the width/height attributes when the format is unknown", async () => {
      mockGetFileById.mockResolvedValue({ content: Buffer.from("notanimage"), type: "image/webp" });

      const xml = await docxXml(
        await generatePolicyDOCX(
          "Doc",
          '<img src="/api/file-manager/1" width="200" height="100">',
          1,
        ),
      );

      expect(xml).toContain(`cx="${200 * 9525}"`);
      expect(xml).toContain(`cy="${100 * 9525}"`);
    });

    it("falls back to the inline style when no dimension attributes are present", async () => {
      mockGetFileById.mockResolvedValue({ content: Buffer.from("notanimage"), type: "image/webp" });

      const xml = await docxXml(
        await generatePolicyDOCX(
          "Doc",
          `<img src="/api/file-manager/1" style="width: 250px; height: 125px">`,
          1,
        ),
      );

      expect(xml).toContain(`cx="${250 * 9525}"`);
      expect(xml).toContain(`cy="${125 * 9525}"`);
    });

    it("falls back to 400x300 when no dimensions can be determined", async () => {
      mockGetFileById.mockResolvedValue({ content: Buffer.from("notanimage"), type: "image/webp" });

      const xml = await docxXml(
        await generatePolicyDOCX("Doc", '<img src="/api/file-manager/1">', 1),
      );

      expect(xml).toContain(`cx="${400 * 9525}"`);
      expect(xml).toContain(`cy="${300 * 9525}"`);
    });

    it("scales oversized images down to 500px wide, preserving aspect ratio", async () => {
      mockGetFileById.mockResolvedValue({ content: pngBuffer(1000, 400), type: "image/png" });

      const xml = await docxXml(
        await generatePolicyDOCX("Doc", '<img src="/api/file-manager/1">', 1),
      );

      expect(xml).toContain(`cx="${500 * 9525}"`);
      expect(xml).toContain(`cy="${200 * 9525}"`);
    });

    it("produces a document from empty content", async () => {
      const text = await docxText(await generatePolicyDOCX("Empty Policy", "", 1));

      expect(text).toContain("Empty Policy");
      expect(text).toContain("Generated by VerifyWise");
    });
  });
});
