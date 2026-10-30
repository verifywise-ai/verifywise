// Servers/services/intakeLiveChecks/docxGuard.ts
// Zip bomb guard for DOCX files uploaded to the public prefill endpoint.
// mammoth inflates word/document.xml completely into memory, so a 10 MB
// upload could expand to gigabytes. This reads the zip's central directory
// (no inflation) and refuses too many entries or too large declared sizes.
// A declared size is only the uploader's claim, and JSZip compares it with
// the real size after inflating everything, so each entry is then inflated
// with zlib's maxOutputLength: off the event loop, stopping at the cap.
import { promisify } from "util";
import { inflateRaw } from "zlib";
import JSZip from "jszip";

export const DOCX_MAX_ENTRIES = 1_000;
export const DOCX_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const DOCX_MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const DOCUMENT_ENTRY = "word/document.xml";

const STORED = "\x00\x00";
const DEFLATE = "\x08\x00";

const inflateRawAsync = promisify(inflateRaw) as (
  buffer: Uint8Array,
  options: { maxOutputLength: number },
) => Promise<Buffer>;

/**
 * JSZip keeps an entry's declared size, compression method and compressed
 * bytes on the private `_data` object (typed in JSZip's own index.d.ts as
 * CompressedObject). Anything unexpected fails closed.
 */
interface EntryData {
  uncompressedSize: number;
  method: string;
  content: Uint8Array;
}

function entryData(entry: JSZip.JSZipObject): EntryData | null {
  const data = (
    entry as unknown as {
      _data?: {
        uncompressedSize?: unknown;
        compression?: { magic?: unknown };
        compressedContent?: unknown;
      };
    }
  )._data;
  const size = data?.uncompressedSize;
  const method = data?.compression?.magic;
  const content = data?.compressedContent;
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return null;
  if (typeof method !== "string" || !(content instanceof Uint8Array)) return null;
  return { uncompressedSize: size, method, content };
}

/** The entry's real size, or null when it passes `limit` bytes, fails or uses another method. */
async function realSize(data: EntryData, limit: number): Promise<number | null> {
  if (data.method === STORED) return data.content.length <= limit ? data.content.length : null;
  if (data.method !== DEFLATE) return null;
  try {
    // Throws a RangeError as soon as the output would pass the limit.
    const inflated = await inflateRawAsync(data.content, { maxOutputLength: Math.max(1, limit) });
    return inflated.length <= limit ? inflated.length : null;
  } catch {
    return null;
  }
}

/** True when a DOCX buffer is a readable zip within the entry and size caps. */
export async function isDocxWithinLimits(buffer: Buffer): Promise<boolean> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return false;
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length === 0 || entries.length > DOCX_MAX_ENTRIES) return false;

  const datas: Array<{ name: string; data: EntryData }> = [];
  let declaredTotal = 0;
  for (const entry of entries) {
    const data = entryData(entry);
    if (!data) return false;
    if (entry.name === DOCUMENT_ENTRY && data.uncompressedSize > DOCX_MAX_DOCUMENT_BYTES) {
      return false;
    }
    declaredTotal += data.uncompressedSize;
    if (declaredTotal > DOCX_MAX_TOTAL_BYTES) return false;
    datas.push({ name: entry.name, data });
  }

  let remaining = DOCX_MAX_TOTAL_BYTES;
  for (const { name, data } of datas) {
    const limit =
      name === DOCUMENT_ENTRY ? Math.min(DOCX_MAX_DOCUMENT_BYTES, remaining) : remaining;
    const size = await realSize(data, limit);
    if (size === null) return false;
    remaining -= size;
  }
  return true;
}
