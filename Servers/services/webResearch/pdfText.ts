/**
 * The PDF reader of the web research toolkit: the bytes of a PDF that a vendor, or anyone a search
 * returned, published, turned into the text, the title and the date of the document.
 *
 * Data processing agreements, SOC 2 letters and security white papers are PDFs, so a research that
 * cannot read them misses the pages that matter most. But a PDF is a file that a third party wrote
 * and a library has to interpret, so the reading is walled in:
 *
 * - The bytes have been fetched by `guardedFetch` already (address policy, robots.txt, at most
 *   MAX_PDF_BYTES, counted after decompression). Nothing here makes a request.
 * - `pdf-parse` runs in a worker thread of its own, one thread for each file, with a limit on its
 *   heap (PDF_WORKER_HEAP_MB), a time limit (PDF_TIMEOUT_MS) and a limit on the pages it reads
 *   (MAX_PDF_PAGES). The thread is ended when the time is up, when the heap is full and when the
 *   caller gives up. The library's evaluation of font programs is switched off. A thread is not a
 *   sandbox: it bounds time and memory, and does not make a flaw of the library harmless.
 * - At most PDF_CONCURRENCY files are read at once in the process, however many runs are going
 *   (see limiter.ts).
 * - What comes out is text only, cleaned like any text a third party wrote; the text of a failure
 *   is never kept, because it can hold a path or a piece of the file.
 *
 * The worker is a script in a string, run with `eval`, and not a file of the build: it needs no
 * copying into `dist/`, and a test can replace it. `pdf-parse` is found by the parent
 * (`require.resolve`) and given to the worker by path, as the worker has no module paths of its own.
 */
import { Worker } from "node:worker_threads";
import { cutAtCodePoint } from "../vendorResearch/text";
import { createLimiter } from "./limiter";
import { MAX_EXCERPT_CHARS, MAX_PAGE_PARTS, tidyText, toIsoDate } from "./pageText";

/** The media types of a PDF. */
export const PDF_MEDIA_TYPES: readonly string[] = ["application/pdf", "application/x-pdf"];
/**
 * The types that servers give a file they do not know: a PDF is sometimes sent as one of these.
 * They are allowed only for an address that ends in `.pdf`, and only if the file begins like a PDF.
 */
export const OCTET_STREAM_TYPES: readonly string[] = [
  "application/octet-stream",
  "binary/octet-stream",
];

/** The most bytes of a PDF that are read (10 MiB), after decompression. */
export const MAX_PDF_BYTES = 10_485_760;
/** The most pages of a PDF that are read; the page count of the document is still reported. */
export const MAX_PDF_PAGES = 100;
/** The time a file may take, from the start of the thread to the text. */
export const PDF_TIMEOUT_MS = 20_000;
/** The heap of the thread, in MiB. A thread that needs more is ended. */
export const PDF_WORKER_HEAP_MB = 256;
/** The files that are read at the same time in the process. */
export const PDF_CONCURRENCY = 2;
/** A file with less text than this is a scan, or empty, and is not a page. */
export const MIN_PDF_TEXT_CHARS = 40;

/** The longest title that is kept. */
const MAX_TITLE_CHARS = 300;
/** The first year of a PDF date that is believed (the format dates from 1993). */
const FIRST_PDF_YEAR = 1993;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PdfLimits {
  maxPages: number;
  maxChars: number;
  timeoutMs: number;
  heapMb: number;
}

/** What the worker finds in a file, before any of it is cleaned. */
export interface RawPdf {
  /** The text of each page that was read, in order. */
  pages: string[];
  /** The pages of the document, whether or not they were read. */
  total: number;
  title: string | null;
  /** The `CreationDate` and the `ModDate` of the document, as the file writes them. */
  created: string | null;
  modified: string | null;
}

/** Turns the bytes of a PDF into its raw contents; the worker, except in a test. */
export type PdfRunner = (data: Buffer, limits: PdfLimits, signal?: AbortSignal) => Promise<RawPdf>;

export type PdfFailure =
  "not_a_pdf" | "no_text" | "too_slow" | "too_big" | "unreadable" | "aborted";

const FAILURE_MESSAGES: Record<PdfFailure, string> = {
  not_a_pdf: "The file is not a PDF.",
  no_text: "The PDF holds no text that can be read.",
  too_slow: "The PDF took too long to read.",
  too_big: "The PDF needs more memory than a read may use.",
  unreadable: "The PDF could not be read.",
  aborted: "The read of the PDF was cancelled.",
};

/** The message is fixed: whatever went wrong, it repeats nothing of the file. */
export class PdfError extends Error {
  constructor(readonly reason: PdfFailure) {
    super(FAILURE_MESSAGES[reason]);
    this.name = "PdfError";
  }
}

export interface PdfDocument {
  /** The title of the document; its file name when it has none worth keeping; else empty. */
  title: string;
  /** The later of the day it was made and the day it was last changed, as an ISO string. */
  publishedAt: string | null;
  text: string;
  /** The pages of the document. */
  pages: number;
}

/** Whether the bytes begin like a PDF: the format allows some junk, but the signature is in the first 1,024. */
export function looksLikePdf(body: Buffer): boolean {
  return body.subarray(0, 1024).includes("%PDF-");
}

const PDF_DATE =
  /^(?:D:)?(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?\s*(Z|[+-]\d{2}(?:'?\d{2}'?)?)?/;

/**
 * A date as a PDF writes it (`D:20240301101500+01'00'`) as an ISO string in UTC, else null. The
 * year, month and day are needed: a date of a year alone says too little. A time with no offset is
 * taken as UTC, so the answer does not depend on the time zone of the server.
 */
export function pdfDateToIso(value: string): string | null {
  const match = PDF_DATE.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  const date = `${year}-${month}-${day}`;
  if (hour === undefined || minute === undefined) return toIsoDate(date);
  let offset = "Z";
  if (zone !== undefined && zone !== "Z") {
    const digits = zone.replace(/\D/g, "");
    offset = `${zone[0]}${digits.slice(0, 2)}:${digits.slice(2, 4) || "00"}`;
  }
  return toIsoDate(`${date}T${hour}:${minute}:${second ?? "00"}${offset}`);
}

/** The glyphs a print program sets for two or three letters, which no search for the word would find. */
const LIGATURES = /[\uFB00-\uFB06]/g;
const SOFT_HYPHEN = /\u00AD/g;

// A line that starts an item of a list or a numbered clause starts a paragraph.
const ITEM =
  /^(?:[•●○▪■◦‣⁃·*–—-]\s|\(?\d{1,3}[.)]\s|\d{1,3}(?:\.\d{1,3})+\.?\s|\(?[a-z][.)]\s|\(?[ivxlc]{1,5}[.)]\s)/i;

/** How much shorter than the page's full line a line may be and still have been filled by the next word. */
const FULL_LINE = 0.92;

const isLetter = (character: string) => character.toLowerCase() !== character.toUpperCase();
const isDigit = (character: string) => character >= "0" && character <= "9";

/** The first word of a line (up to the first white space). */
const firstWordOf = (line: string) => /^\S*/.exec(line)?.[0] ?? "";

/**
 * The text of one page, as the library gives it (one line of print on each line), as paragraphs
 * separated by a blank line, so that the excerpt of a page can pick the paragraphs that hold the
 * words it is looking for.
 *
 * A line continues the paragraph unless the line before it ended early (it stopped short of the
 * width of the page, though the first word of this line would have fitted: the print had no reason
 * to break it there), the line starts an item of a list or a numbered clause, or the page leaves
 * a blank line. A line that ends in a hyphen after a letter, when the next line starts with a
 * letter or a digit (and is not an item), is joined to it without a space: the print broke a word
 * there, and the hyphen is kept, as it is part of the word as often as not (`Baden-Württemberg`).
 *
 * It is a guess, and a wrong guess changes only where a paragraph ends: no word is lost or added,
 * and a quote is checked with white space made alike.
 */
export function reflowPdfPage(page: string): string {
  const lines = page.split("\n").map((line) => line.trim());
  const lengths = lines
    .filter((line) => line !== "")
    .map((line) => line.length)
    .sort((a, b) => a - b);
  if (lengths.length === 0) return "";
  // The line of full width: the length that nine lines in ten do not pass.
  const width = lengths[Math.ceil(lengths.length * 0.9) - 1];

  const paragraphs: string[] = [];
  let current = "";
  let previous = "";
  const end = () => {
    if (current !== "") paragraphs.push(current);
    current = "";
    previous = "";
  };

  for (const line of lines) {
    if (line === "") {
      end();
      continue;
    }
    if (current !== "") {
      const hyphenated =
        previous.endsWith("-") &&
        previous.length > 1 &&
        isLetter(previous[previous.length - 2]) &&
        (isLetter(line[0]) || isDigit(line[0])) &&
        !ITEM.test(line);
      if (hyphenated) {
        current += line;
        previous = line;
        continue;
      }
      const endedEarly = previous.length + 1 + firstWordOf(line).length <= width * FULL_LINE;
      if (endedEarly || ITEM.test(line)) end();
    }
    current = current === "" ? line : `${current} ${line}`;
    previous = line;
  }
  end();
  return paragraphs.join("\n\n");
}

/** Titles that a program wrote when the author did not: a file name, the name of the program, "Untitled". */
const NOT_A_TITLE =
  /^(?:microsoft (?:word|excel|powerpoint) - .*|untitled(?:[\s_-]*\d+)?|document\s*\d*|powerpoint presentation|.*\.(?:docx?|xlsx?|pptx?|pdf|indd|tex|rtf|odt|txt))$/i;

const oneLine = (text: string) => tidyText(text).replace(/\s+/g, " ");

/** The name of the file in the address, as words: `/legal/Acme_DPA-v3.pdf` is "Acme DPA v3". */
function titleFromAddress(address: string | undefined): string {
  if (address === undefined) return "";
  let pathname: string;
  try {
    pathname = new URL(address).pathname;
  } catch {
    return "";
  }
  const last =
    pathname
      .split("/")
      .filter((segment) => segment !== "")
      .pop() ?? "";
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // An escape that is not valid: the name is kept as it is written.
  }
  return oneLine(name.replace(/\.pdf$/i, "").replace(/[-_+]+/g, " "));
}

function titleOf(raw: RawPdf, address: string | undefined): string {
  const own = raw.title === null ? "" : oneLine(raw.title);
  const title = own !== "" && !NOT_A_TITLE.test(own) ? own : titleFromAddress(address);
  return cutAtCodePoint(title, MAX_TITLE_CHARS).trim();
}

/**
 * The later of the dates the document gives, but not one that lies more than a day ahead of `now`
 * (the clock of whoever made the file must not make an old document new) and not one before the
 * format existed (1970 is what a program writes when it has no date).
 */
function dateOf(raw: RawPdf, now: number): string | null {
  let latest: string | null = null;
  for (const value of [raw.created, raw.modified]) {
    const iso = value === null ? null : pdfDateToIso(value);
    if (iso === null) continue;
    const time = Date.parse(iso);
    if (time > now + DAY_MS || new Date(time).getUTCFullYear() < FIRST_PDF_YEAR) continue;
    if (latest === null || time > Date.parse(latest)) latest = iso;
  }
  return latest;
}

/**
 * The script of the worker. It reads the file with `pdf-parse` and answers with the raw contents,
 * or with `{ ok: false }` for any failure: the parent says nothing of why.
 *
 * `first` limits the pages that are read; the loop stops adding pages when the text is long enough.
 */
export const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  let parser;
  try {
    const { PDFParse } = require(workerData.modulePath);
    parser = new PDFParse({
      data: workerData.data,
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    });
    const info = await parser.getInfo();
    const result = await parser.getText({ first: workerData.maxPages, pageJoiner: "" });
    const pages = [];
    let chars = 0;
    for (const page of result.pages) {
      pages.push(page.text);
      chars += page.text.length;
      if (chars >= workerData.maxChars) break;
    }
    const meta = info.info || {};
    const text = (value) => (typeof value === "string" ? value : null);
    parentPort.postMessage({
      ok: true,
      pdf: {
        pages,
        total: result.total,
        title: text(meta.Title),
        created: text(meta.CreationDate),
        modified: text(meta.ModDate),
      },
    });
  } catch (error) {
    parentPort.postMessage({ ok: false });
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
})();
`;

/**
 * A runner that reads the file in a worker thread running `source` (the script of the reader, except
 * in a test), and ends the thread when it answers, when the time is up, when the heap is full and
 * when the caller gives up.
 */
export function createWorkerRunner(source: string = WORKER_SOURCE): PdfRunner {
  return (data, limits, signal) =>
    new Promise<RawPdf>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new PdfError("aborted"));
        return;
      }
      // A copy, handed over to the thread: a Buffer can be a view into a pool that others use.
      const bytes = new Uint8Array(data);
      const worker = new Worker(source, {
        eval: true,
        workerData: {
          modulePath: require.resolve("pdf-parse"),
          data: bytes,
          maxPages: limits.maxPages,
          maxChars: limits.maxChars,
        },
        transferList: [bytes.buffer],
        resourceLimits: {
          maxOldGenerationSizeMb: limits.heapMb,
          maxYoungGenerationSizeMb: 32,
          stackSizeMb: 4,
        },
      });

      let timer: NodeJS.Timeout | undefined;
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        void worker.terminate();
        settle();
      };
      const onAbort = () => finish(() => reject(new PdfError("aborted")));

      timer = setTimeout(() => finish(() => reject(new PdfError("too_slow"))), limits.timeoutMs);
      signal?.addEventListener("abort", onAbort, { once: true });
      worker.once("message", (message: { ok?: boolean; pdf?: RawPdf }) =>
        finish(() =>
          message?.ok === true && message.pdf !== undefined
            ? resolve(message.pdf)
            : reject(new PdfError("unreadable")),
        ),
      );
      worker.once("error", (error: NodeJS.ErrnoException) =>
        finish(() =>
          reject(
            new PdfError(error.code === "ERR_WORKER_OUT_OF_MEMORY" ? "too_big" : "unreadable"),
          ),
        ),
      );
      // A thread that leaves without an answer, and has not been ended by us.
      worker.once("exit", () => finish(() => reject(new PdfError("unreadable"))));
    });
}

/** The places for the files that are read at the same time in the process. */
const places = createLimiter(PDF_CONCURRENCY);

const defaultRunner = createWorkerRunner();

export interface ReadPdfOptions {
  /** The address that answered; its file name titles a document that has no title of its own. */
  url?: string;
  signal?: AbortSignal;
  /** Replaces the worker, for tests. */
  run?: PdfRunner;
  /** The clock, for tests. */
  now?: () => number;
}

/**
 * The text, title and date of a PDF, or a PdfError: the bytes are not a PDF, it has no text to
 * read (a scan), it took too long, it needed too much memory, it could not be read, or the caller
 * gave up. The text is at most what a page can be shown in (MAX_PAGE_PARTS parts), in paragraphs.
 */
export async function readPdf(body: Buffer, options: ReadPdfOptions = {}): Promise<PdfDocument> {
  const { url, signal, run = defaultRunner, now = Date.now } = options;
  if (signal?.aborted) throw new PdfError("aborted");
  if (!looksLikePdf(body)) throw new PdfError("not_a_pdf");

  const maxChars = MAX_EXCERPT_CHARS * MAX_PAGE_PARTS;
  const limits: PdfLimits = {
    maxPages: MAX_PDF_PAGES,
    maxChars,
    timeoutMs: PDF_TIMEOUT_MS,
    heapMb: PDF_WORKER_HEAP_MB,
  };
  const release = await places.take(signal, () => new PdfError("aborted"));
  let raw: RawPdf;
  try {
    raw = await run(body, limits, signal);
  } catch (error) {
    throw error instanceof PdfError ? error : new PdfError("unreadable");
  } finally {
    release();
  }

  const paragraphs = raw.pages
    .map((page) =>
      reflowPdfPage(
        page.replace(LIGATURES, (glyph) => glyph.normalize("NFKC")).replace(SOFT_HYPHEN, ""),
      ),
    )
    .filter((page) => page !== "");
  const text = cutAtCodePoint(tidyText(paragraphs.join("\n\n")), maxChars).trimEnd();
  if (text.length < MIN_PDF_TEXT_CHARS) throw new PdfError("no_text");

  return {
    title: titleOf(raw, url),
    publishedAt: dateOf(raw, now()),
    text,
    pages: raw.total,
  };
}
