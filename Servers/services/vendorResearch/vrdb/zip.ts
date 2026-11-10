/**
 * A reader of zip files (PKWARE's APPNOTE) for the CVE Program's releases (M2 Task 7, Ruling 8 of
 * the M2 plan): the end of the central directory, Zip64 when its fields say so, then each entry the
 * caller accepts, stored or deflated, with its inflated size and its CRC-32 checked against the
 * directory. An accepted entry whose name ends in `.zip` is read once more, as the entries of a zip
 * inside the zip (the baseline file is one); a zip inside that is refused.
 *
 * A zip is third-party data, read in time linear in its size and within limits its caller fixes:
 * the entries of one directory, the inflated bytes of one entry, and the bytes of all the entries it
 * hands out (a zip inside the zip is held to that last limit too). An entry's name goes to the
 * caller and never becomes a path. What is wrong with a zip is a ZipError: `not_zip` (no end of a
 * central directory, and not the start of a zip either), `corrupt` (cut, or an offset, a size or a
 * checksum that does not hold), `unsupported` (another method, an encrypted entry, several disks),
 * `too_large` and `too_deep`.
 *
 * One parse (`directoryOf`, `dataOf`) asks for the bytes it needs; `forEachZipEntry` and `readZip`
 * give them from a buffer (the first hands each entry out as it is read, the second gives them all)
 * and `readZipFile` from a file, one entry in memory at a time, and inflates a zip inside the zip to
 * a temporary file of its own, which it deletes. `streamZipEntry` reads the one file of a zip in
 * memory without ever holding the file: its inflated bytes go to the caller in pieces, as they come.
 */
import { createReadStream, createWriteStream, promises as fsp } from "fs";
import type { FileHandle } from "fs/promises";
import os from "os";
import path from "path";
import { Readable, Transform, Writable } from "stream";
import { pipeline } from "stream/promises";
import zlib from "zlib";

export type ZipErrorCode = "not_zip" | "corrupt" | "unsupported" | "too_large" | "too_deep";

export class ZipError extends Error {
  constructor(readonly code: ZipErrorCode) {
    super(`The zip cannot be read (${code}).`);
    this.name = "ZipError";
  }
}

export interface ZipLimits {
  /** The most entries of one directory, accepted or not. */
  maxEntries: number;
  /** The most bytes of one entry, inflated. */
  maxEntryBytes: number;
  /** The most bytes of all the entries handed out, inflated, and of a zip inside the zip. */
  maxTotalBytes: number;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export interface ZipFileOptions {
  /** Where a zip inside the zip is inflated; the system's temporary directory by default. */
  tempDir?: string;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const ZIP64_END_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const LOCAL_BYTES = 30;
const CENTRAL_BYTES = 46;
const END_BYTES = 22;
const ZIP64_END_BYTES = 56;
const ZIP64_LOCATOR_BYTES = 20;
const MAX_COMMENT_BYTES = 0xffff;
const ZIP64_EXTRA_ID = 0x0001;
const MAX16 = 0xffff;
const MAX32 = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;
const ENCRYPTED = 0x0001;
const UTF8_NAMES = 0x0800;
/** The name of a zip inside the zip. */
const NESTED = /\.zip$/i;

interface DirectoryEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

interface Directory {
  entries: DirectoryEntry[];
  /** Where the directory starts: the data of every entry lies before it. */
  offset: number;
}

/** A read the parse asks of its driver: `length` bytes at `offset` of the zip. */
interface Read {
  offset: number;
  length: number;
}

type Parse<T> = Generator<Read, T, Buffer>;

/** The bytes of all the entries handed out so far, at every level. */
interface Total {
  bytes: number;
}

/** A field of 64 bits as a number: a zip of any real size fits one. */
function u64(buffer: Buffer, at: number): number {
  const value = buffer.readBigUInt64LE(at);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError("corrupt");
  return Number(value);
}

/** The data of an entry's Zip64 extra field, or null when it has none. */
function zip64FieldsOf(extra: Buffer): Buffer | null {
  let at = 0;
  while (at + 4 <= extra.length) {
    const id = extra.readUInt16LE(at);
    const length = extra.readUInt16LE(at + 2);
    if (at + 4 + length > extra.length) return null;
    if (id === ZIP64_EXTRA_ID) return extra.subarray(at + 4, at + 4 + length);
    at += 4 + length;
  }
  return null;
}

/** The entries of a central directory of `count` entries that starts at `offset`. */
function entriesOf(directory: Buffer, count: number, offset: number): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];
  let at = 0;
  for (let index = 0; index < count; index += 1) {
    if (at + CENTRAL_BYTES > directory.length || directory.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
      throw new ZipError("corrupt");
    }
    const flags = directory.readUInt16LE(at + 8);
    const nameStart = at + CENTRAL_BYTES;
    const extraStart = nameStart + directory.readUInt16LE(at + 28);
    const extraEnd = extraStart + directory.readUInt16LE(at + 30);
    const next = extraEnd + directory.readUInt16LE(at + 32);
    if (next > directory.length) throw new ZipError("corrupt");
    const entry: DirectoryEntry = {
      name: directory.toString(flags & UTF8_NAMES ? "utf8" : "latin1", nameStart, extraStart),
      flags,
      method: directory.readUInt16LE(at + 10),
      crc: directory.readUInt32LE(at + 16),
      compressedSize: directory.readUInt32LE(at + 20),
      size: directory.readUInt32LE(at + 24),
      localOffset: directory.readUInt32LE(at + 42),
    };
    if (entry.size === MAX32 || entry.compressedSize === MAX32 || entry.localOffset === MAX32) {
      // Only the fields whose 32 bits are full are in the Zip64 field, in this order.
      const fields = zip64FieldsOf(directory.subarray(extraStart, extraEnd));
      let field = 0;
      const take = (): number => {
        if (fields === null || field + 8 > fields.length) throw new ZipError("corrupt");
        field += 8;
        return u64(fields, field - 8);
      };
      if (entry.size === MAX32) entry.size = take();
      if (entry.compressedSize === MAX32) entry.compressedSize = take();
      if (entry.localOffset === MAX32) entry.localOffset = take();
    }
    if (entry.localOffset >= offset) throw new ZipError("corrupt");
    entries.push(entry);
    at = next;
  }
  return entries;
}

/** The central directory of a zip of `size` bytes: its end, its Zip64 end when it has one, its entries. */
function* directoryOf(size: number, limits: ZipLimits): Parse<Directory> {
  const tailLength = Math.min(size, END_BYTES + MAX_COMMENT_BYTES);
  const tailStart = size - tailLength;
  const tail = yield { offset: tailStart, length: tailLength };
  let end = -1;
  for (let at = tail.length - END_BYTES; at >= 0; at -= 1) {
    if (
      tail.readUInt32LE(at) === END_SIGNATURE &&
      at + END_BYTES + tail.readUInt16LE(at + 20) === tail.length
    ) {
      end = at;
      break;
    }
  }
  if (end < 0) {
    // A zip that was cut starts as a zip and has lost its end.
    const head = size >= 4 ? yield { offset: 0, length: 4 } : null;
    throw new ZipError(head?.readUInt32LE(0) === LOCAL_SIGNATURE ? "corrupt" : "not_zip");
  }
  if (tail.readUInt16LE(end + 4) !== 0 || tail.readUInt16LE(end + 6) !== 0) {
    throw new ZipError("unsupported");
  }
  const endAt = tailStart + end;
  let count = tail.readUInt16LE(end + 10);
  let length = tail.readUInt32LE(end + 12);
  let offset = tail.readUInt32LE(end + 16);
  let directoryEnd = endAt;
  if (count === MAX16 || length === MAX32 || offset === MAX32) {
    if (endAt < ZIP64_LOCATOR_BYTES) throw new ZipError("corrupt");
    const locatorAt = endAt - ZIP64_LOCATOR_BYTES;
    const locator = yield { offset: locatorAt, length: ZIP64_LOCATOR_BYTES };
    if (locator.readUInt32LE(0) !== ZIP64_LOCATOR_SIGNATURE) throw new ZipError("corrupt");
    if (locator.readUInt32LE(16) > 1) throw new ZipError("unsupported");
    const recordAt = u64(locator, 8);
    if (recordAt + ZIP64_END_BYTES > locatorAt) throw new ZipError("corrupt");
    const record = yield { offset: recordAt, length: ZIP64_END_BYTES };
    if (record.readUInt32LE(0) !== ZIP64_END_SIGNATURE) throw new ZipError("corrupt");
    count = u64(record, 32);
    length = u64(record, 40);
    offset = u64(record, 48);
    directoryEnd = recordAt;
  }
  if (count > limits.maxEntries) throw new ZipError("too_large");
  if (offset + length > directoryEnd || length < count * CENTRAL_BYTES) {
    throw new ZipError("corrupt");
  }
  const directory = yield { offset, length };
  return { entries: entriesOf(directory, count, offset), offset };
}

/** Where the data of an entry is: after its local header, before the directory. */
function* dataOf(
  entry: DirectoryEntry,
  directoryOffset: number,
): Parse<{ start: number; length: number }> {
  if (entry.localOffset + LOCAL_BYTES > directoryOffset) throw new ZipError("corrupt");
  const header = yield { offset: entry.localOffset, length: LOCAL_BYTES };
  if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new ZipError("corrupt");
  const start = entry.localOffset + LOCAL_BYTES + header.readUInt16LE(26) + header.readUInt16LE(28);
  if (start + entry.compressedSize > directoryOffset) throw new ZipError("corrupt");
  return { start, length: entry.compressedSize };
}

/** The most bytes deflate gives `size` bytes (zlib's deflateBound): more cannot inflate to them. */
const deflateBound = (size: number): number =>
  size + Math.floor(size / 4_096) + Math.floor(size / 16_384) + Math.floor(size / 33_554_432) + 13;

/**
 * Whether an accepted entry is a zip to read once more, and the most bytes it may inflate to; it
 * throws for an entry that cannot be read within the limits.
 */
function planOf(
  entry: DirectoryEntry,
  limits: ZipLimits,
  depth: number,
  total: Total,
): { nested: boolean; limit: number } {
  if (entry.flags & ENCRYPTED) throw new ZipError("unsupported");
  if (entry.method !== STORED && entry.method !== DEFLATED) throw new ZipError("unsupported");
  if (entry.method === STORED && entry.compressedSize !== entry.size) {
    throw new ZipError("corrupt");
  }
  const nested = NESTED.test(entry.name);
  if (nested && depth > 0) throw new ZipError("too_deep");
  const limit = nested
    ? limits.maxTotalBytes
    : Math.min(limits.maxEntryBytes, limits.maxTotalBytes - total.bytes);
  if (entry.size > limit || entry.compressedSize > deflateBound(limit)) {
    throw new ZipError("too_large");
  }
  return { nested, limit };
}

const codeOf = (error: unknown): string =>
  typeof (error as { code?: unknown } | null)?.code === "string"
    ? (error as { code: string }).code
    : "";

/** The data of an entry from its stored or deflated bytes, as large and with the checksum the directory says. */
function inflated(entry: DirectoryEntry, raw: Buffer, limit: number): Buffer {
  let data: Buffer;
  if (entry.method === STORED) {
    data = Buffer.from(raw);
  } else {
    try {
      data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, limit) });
    } catch (error) {
      const code = codeOf(error);
      if (code === "ERR_BUFFER_TOO_LARGE") throw new ZipError("too_large");
      if (code.startsWith("Z_")) throw new ZipError("corrupt");
      throw error;
    }
  }
  if (data.length !== entry.size || zlib.crc32(data) !== entry.crc) throw new ZipError("corrupt");
  return data;
}

const isFolder = (entry: DirectoryEntry) => entry.name.endsWith("/");

function sliceOf(buffer: Buffer, { offset, length }: Read): Buffer {
  if (offset < 0 || length < 0 || offset + length > buffer.length) throw new ZipError("corrupt");
  return buffer.subarray(offset, offset + length);
}

function run<T>(parse: Parse<T>, buffer: Buffer): T {
  let step = parse.next();
  while (!step.done) step = parse.next(sliceOf(buffer, step.value));
  return step.value;
}

function readLevel(
  buffer: Buffer,
  accept: (name: string) => boolean,
  limits: ZipLimits,
  depth: number,
  total: Total,
  onEntry: (entry: ZipEntry) => void,
): void {
  const directory = run(directoryOf(buffer.length, limits), buffer);
  for (const entry of directory.entries) {
    if (isFolder(entry) || !accept(entry.name)) continue;
    const { nested, limit } = planOf(entry, limits, depth, total);
    const place = run(dataOf(entry, directory.offset), buffer);
    const data = inflated(
      entry,
      sliceOf(buffer, { offset: place.start, length: place.length }),
      limit,
    );
    if (nested) {
      readLevel(data, accept, limits, depth + 1, total, onEntry);
    } else {
      total.bytes += data.length;
      onEntry({ name: entry.name, data });
    }
  }
}

/**
 * Hands each entry of a zip in memory that `accept` takes to `onEntry`, in the order of its
 * directory, as it is read: the caller keeps what it needs of an entry, and the reader keeps none.
 */
export function forEachZipEntry(
  buffer: Buffer,
  accept: (name: string) => boolean,
  limits: ZipLimits,
  onEntry: (entry: ZipEntry) => void,
): void {
  readLevel(buffer, accept, limits, 0, { bytes: 0 }, onEntry);
}

/** The entries of a zip in memory that `accept` takes, in the order of its directory. */
export function readZip(
  buffer: Buffer,
  accept: (name: string) => boolean,
  limits: ZipLimits,
): ZipEntry[] {
  const out: ZipEntry[] = [];
  forEachZipEntry(buffer, accept, limits, (entry) => out.push(entry));
  return out;
}

async function readAt(handle: FileHandle, size: number, { offset, length }: Read): Promise<Buffer> {
  if (offset < 0 || length < 0 || offset + length > size) throw new ZipError("corrupt");
  const buffer = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await handle.read(buffer, done, length - done, offset + done);
    if (bytesRead === 0) throw new ZipError("corrupt");
    done += bytesRead;
  }
  return buffer;
}

async function runFile<T>(parse: Parse<T>, read: (at: Read) => Promise<Buffer>): Promise<T> {
  let step = parse.next();
  while (!step.done) step = parse.next(await read(step.value));
  return step.value;
}

/** Inflates a zip inside the zip to a file of its own, its size and checksum counted as it comes. */
async function inflateToFile(
  source: string,
  entry: DirectoryEntry,
  place: { start: number; length: number },
  limit: number,
  target: string,
): Promise<void> {
  let bytes = 0;
  let crc = 0;
  const counted = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > limit) {
        done(new ZipError("too_large"));
        return;
      }
      crc = zlib.crc32(chunk, crc);
      done(null, chunk);
    },
  });
  const input =
    place.length === 0
      ? Readable.from([])
      : createReadStream(source, { start: place.start, end: place.start + place.length - 1 });
  const output = createWriteStream(target, { flags: "wx" });
  try {
    if (entry.method === DEFLATED) await pipeline(input, zlib.createInflateRaw(), counted, output);
    else await pipeline(input, counted, output);
  } catch (error) {
    if (error instanceof ZipError) throw error;
    if (codeOf(error).startsWith("Z_")) throw new ZipError("corrupt");
    throw error;
  }
  if (bytes !== entry.size || crc !== entry.crc) throw new ZipError("corrupt");
}

async function readFileLevel(
  file: string,
  accept: (name: string) => boolean,
  limits: ZipLimits,
  onEntry: (entry: ZipEntry) => Promise<void>,
  tempDir: string,
  depth: number,
  total: Total,
): Promise<void> {
  const handle = await fsp.open(file, "r");
  try {
    const { size } = await handle.stat();
    const read = (at: Read) => readAt(handle, size, at);
    const directory = await runFile(directoryOf(size, limits), read);
    for (const entry of directory.entries) {
      if (isFolder(entry) || !accept(entry.name)) continue;
      const { nested, limit } = planOf(entry, limits, depth, total);
      const place = await runFile(dataOf(entry, directory.offset), read);
      if (!nested) {
        const raw = await read({ offset: place.start, length: place.length });
        const data = inflated(entry, raw, limit);
        total.bytes += data.length;
        await onEntry({ name: entry.name, data });
        continue;
      }
      // The reader names the file; the entry's name is never a path.
      const folder = await fsp.mkdtemp(path.join(tempDir, "vrdb-zip-"));
      try {
        const inner = path.join(folder, "nested.zip");
        await inflateToFile(file, entry, place, limit, inner);
        await readFileLevel(inner, accept, limits, onEntry, tempDir, depth + 1, total);
      } finally {
        await fsp.rm(folder, { recursive: true, force: true });
      }
    }
  } finally {
    await handle.close();
  }
}

/**
 * The entries of a zip file that `accept` takes, in the order of its directory, each handed to
 * `onEntry` and awaited before the next is read.
 */
export async function readZipFile(
  file: string,
  accept: (name: string) => boolean,
  limits: ZipLimits,
  onEntry: (entry: ZipEntry) => Promise<void>,
  options: ZipFileOptions = {},
): Promise<void> {
  await readFileLevel(file, accept, limits, onEntry, options.tempDir ?? os.tmpdir(), 0, {
    bytes: 0,
  });
}

/** The bytes of a zip's data that `streamZipEntry` hands to the inflater at a time, by default. */
const PIECE_BYTES = 65_536;

/** The most bytes the inflater of `streamZipEntry` gives at a time: the size of its own buffer. */
const INFLATED_CHUNK_BYTES = 65_536;

export interface ZipStreamOptions {
  /** The bytes of the zip's data handed to the inflater at a time; 65,536 by default. */
  pieceBytes?: number;
  /** An entry that is stored (method 0) is `unsupported`; the list's zip is deflated. */
  deflatedOnly?: boolean;
}

/** The data of an entry in pieces of `pieceBytes` bytes: views of the zip, so that nothing is copied. */
function* piecesOf(raw: Buffer, pieceBytes: number): Generator<Buffer> {
  for (let at = 0; at < raw.length; at += pieceBytes) yield raw.subarray(at, at + pieceBytes);
}

/**
 * Streams the one file of a zip in memory: its inflated bytes go to `onChunk` in pieces as they
 * come, and nothing of the entry is held, so that a file of hundreds of megabytes costs the pieces
 * and not the file (`forEachZipEntry` holds the whole entry: about 0.7 GB at the peak for one of
 * 390 MB, where a stream holds about 0.1 GB).
 *
 * The directory is read from the buffer as the other readers read it. The zip must hold exactly one
 * entry that is not a folder, `accept` is asked about that entry only and must take it, its name
 * must not end in `.zip` (a zip inside the zip is not read here), and with `deflatedOnly` it must
 * be deflated; anything else is `unsupported` (an encrypted entry, or a method other than stored or
 * deflated, is `unsupported` as in the other readers). The name is looked at before the size.
 *
 * The size is capped twice. From the directory first: a declared size above `limits.maxEntryBytes`
 * (or what is left of `maxTotalBytes`, which for the one entry is the smaller of the two), or more
 * compressed bytes than a deflate stream of that size could have, is `too_large` before a byte is
 * read. Then by the count: the sizes are those of the central directory, never of the local header
 * (an entry with general purpose bit 3 and a data descriptor has zeros there), and the bytes the
 * inflater gives are counted as they come. A chunk that would take the count past the declared size
 * is not handed on: the read stops as `corrupt`, so that a directory that lies about the size never
 * lets more through than it says, whatever the data holds.
 *
 * The data is read as pieces of `options.pieceBytes` bytes (views of the zip, no copy) to
 * `zlib.createInflateRaw`, in a `pipeline`: the backpressure is the pipeline's. A stored entry
 * follows the same rules without the inflater. A chunk is at most 64 KiB (and at most `pieceBytes`
 * for a stored entry). A zlib error is `corrupt`: a deflate stream that is cut, or that is not one.
 * Bytes after the end of the deflate stream are left unread, as the buffer reader leaves them.
 * Once the data has ended, the count must equal the declared size and the CRC-32, which is kept as
 * the chunks come, the directory's: else `corrupt`.
 *
 * The contract of the callback. `onChunk` is synchronous. Its chunk is valid during the call only:
 * copy what you keep. What the chunks hold is NOT checked until the returned promise resolves,
 * since the size and the CRC-32 are checked last: when it rejects, discard everything that was made
 * from the chunks. An error that `onChunk` throws (of any kind, an Error or not) stops the read
 * and is what the promise rejects with, untouched; no chunk follows it.
 *
 * There is no temporary file and no state shared between calls. `pieceBytes` that is not a whole
 * number above zero is a RangeError (a mistake of the caller, never of the data), checked first.
 * The result is the entry's name and its inflated size.
 */
export async function streamZipEntry(
  buffer: Buffer,
  accept: (name: string) => boolean,
  limits: ZipLimits,
  onChunk: (chunk: Buffer) => void,
  options: ZipStreamOptions = {},
): Promise<{ name: string; bytes: number }> {
  const pieceBytes = options.pieceBytes ?? PIECE_BYTES;
  if (!Number.isInteger(pieceBytes) || pieceBytes < 1) {
    throw new RangeError("pieceBytes must be a whole number above zero.");
  }
  const directory = run(directoryOf(buffer.length, limits), buffer);
  const files = directory.entries.filter((entry) => !isFolder(entry));
  if (files.length !== 1) throw new ZipError("unsupported");
  const [entry] = files;
  if (
    !accept(entry.name) ||
    NESTED.test(entry.name) ||
    (options.deflatedOnly === true && entry.method !== DEFLATED)
  ) {
    throw new ZipError("unsupported");
  }
  planOf(entry, limits, 0, { bytes: 0 });
  const place = run(dataOf(entry, directory.offset), buffer);
  const raw = sliceOf(buffer, { offset: place.start, length: place.length });

  let bytes = 0;
  let crc = 0;
  // What the callback threw is kept apart: a thrown `undefined` must not read as success, and its
  // error, whatever its code, is not a zlib error to be turned into `corrupt`.
  const failure: { thrown: boolean; error?: unknown } = { thrown: false };
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (chunk.length === 0) {
        done();
        return;
      }
      bytes += chunk.length;
      if (bytes > entry.size) {
        done(new ZipError("corrupt"));
        return;
      }
      crc = zlib.crc32(chunk, crc);
      try {
        onChunk(chunk);
      } catch (error) {
        failure.thrown = true;
        failure.error = error;
        done(error instanceof Error ? error : new Error("The callback failed."));
        return;
      }
      done();
    },
  });
  const source = Readable.from(piecesOf(raw, pieceBytes));
  try {
    if (entry.method === DEFLATED) {
      await pipeline(source, zlib.createInflateRaw({ chunkSize: INFLATED_CHUNK_BYTES }), sink);
    } else {
      await pipeline(source, sink);
    }
  } catch (error) {
    if (failure.thrown) throw failure.error;
    if (error instanceof ZipError) throw error;
    if (codeOf(error).startsWith("Z_")) throw new ZipError("corrupt");
    throw error;
  }
  if (bytes !== entry.size || crc !== entry.crc) throw new ZipError("corrupt");
  return { name: entry.name, bytes };
}
