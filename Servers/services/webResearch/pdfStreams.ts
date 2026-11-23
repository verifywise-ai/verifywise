/**
 * The size a PDF unpacks to, measured before the PDF library sees the file (see pdfText.ts).
 *
 * A PDF of a few megabytes can hold a FlateDecode stream that inflates to gigabytes. The library
 * keeps an inflated stream in an ArrayBuffer, outside the heap of its thread, so the heap limit of
 * the thread does not count it, and the whole process grows. So every stream of the file whose
 * filters include FlateDecode, and that the count can find, is inflated here first, only to be
 * counted: no stream may give more than `maxStreamBytes`, and the streams together no more than
 * `maxTotalBytes`.
 *
 * The count reads the file the way the library reads a stream:
 *
 * - The dictionary of a stream is read from the header `N G obj` before the keyword `stream`,
 *   however long it is. The stream's data is `/Length` bytes when that length is written in the
 *   dictionary (or in an object of its own) and `endstream` follows it, else the bytes up to the
 *   next `endstream`.
 * - The filters are read from the dictionary of the stream itself, not from a dictionary inside it,
 *   with `#xx` escapes in names decoded, the last of two entries with one key, `/F` before
 *   `/Filter`, `/DP` before `/DecodeParms`, and through indirect references (`/Filter 9 0 R`).
 *   ASCIIHexDecode and ASCII85Decode before a FlateDecode are decoded too, as are FlateDecode after
 *   FlateDecode. A PNG or TIFF predictor on a FlateDecode adds two rows of its width (`/Columns`,
 *   `/Colors`, `/BitsPerComponent`, computed as the library computes them), since the library
 *   writes a whole row whatever the data holds.
 * - Inflation checks the two header bytes as the library does, then reads the rest as raw deflate
 *   data over a window of zeros: a distance that reaches before the start of the data reads zeros
 *   in the library too, and a check sum at the end is not looked at by either. Data that ends early
 *   gives what it holds. Data that zlib refuses part of the way (the library takes some of it: an
 *   empty stored block, Huffman tables that zlib finds over-subscribed) counts what came before the
 *   fault, plus every byte that zlib did not take at MAX_DEFLATE_RATIO, the most deflate can give
 *   for a byte: the count cannot know what the library makes of it, so it takes the worst. Not in
 *   a file that names `/Encrypt`: there the data is not deflate data until the library decrypts
 *   it, about one stream in a thousand passes the header check by chance and zlib refuses it at
 *   once, and the worst would refuse an ordinary encrypted file; a fault there counts only what came
 *   before it. A damaged stream of a file that is not encrypted can make the file `too_big`.
 *
 * The count is work on the event loop of the process that runs every queue of the worker, so it
 * is bounded: every byte it searches, reads or decodes is charged to one budget (WORK_PER_FILE_BYTE
 * times the file, plus WORK_FLOOR_BYTES, and WORK_PER_STREAM_BYTES for the objects one stream
 * refers to, beyond its own dictionary), a file over it is `too_slow`, and the count lets the rest
 * of the process run at least every SLICE_MS or SLICE_WORK_BYTES of work. Inflation runs on the
 * thread pool of zlib. What it does between two looks at the clock is one token, one search of
 * the file, or up to SLICE_MS of small steps: the longest stretch measured was 20 ms, for files of
 * MAX_PDF_BYTES built to be slow (one name or string of 10 MB, a file of `stream` words with one
 * kind of line break), on a laptop; a slower processor takes longer.
 *
 * It is a first wall, not the only one. It does not see: a stream of an encrypted file (its data
 * is not deflate data until the library decrypts it), a filter it does not decode (LZW, run
 * length, and a FlateDecode after one), the data of a predictor that the next filter reads, a
 * dictionary it cannot read (the library can be more lenient), an object it cannot find, a stream
 * inside an object stream, and an object that the cross-reference table places inside the data of
 * another stream (the count does not search the data of a stream). Those are bounded only by the
 * memory guard of the worker (pdfText.ts), which ends the read when the process grows past a part
 * of its memory limit.
 */
import zlib from "node:zlib";

export interface PdfStreamLimits {
  /** The most bytes one stream may inflate to. */
  maxStreamBytes: number;
  /** The most bytes all the streams of the file together may inflate to. */
  maxTotalBytes: number;
}

/** The window of deflate (32 KiB), as zeros: what the library reads before the start of the data. */
const ZERO_WINDOW = Buffer.alloc(32_768);
/** How deep arrays and dictionaries may nest in the dictionary of a stream before it is not read. */
const MAX_NESTING = 32;
/**
 * The longest word that is turned into text. The library refuses a command of 128 characters, and
 * no key or filter name that the count looks for is that long, so a longer word is passed over
 * without a copy. A number is read whatever its length, as the library reads it.
 */
const MAX_WORD_CHARS = 128;
/**
 * The most bytes deflate gives for one byte of its data: a length of 258 and its distance, each in
 * one bit, twice in a byte.
 */
export const MAX_DEFLATE_RATIO = 1_032;
/** The work the count may do for each byte of the file. */
export const WORK_PER_FILE_BYTE = 4;
/** The work any file may take, however small. */
export const WORK_FLOOR_BYTES = 4 * 1024 * 1024;
/** The work the objects that one stream refers to may take, beyond its own dictionary. */
export const WORK_PER_STREAM_BYTES = 1024 * 1024;
/** How long the count works before it lets the rest of the process run. */
const SLICE_MS = 10;
/** How much work the count does before it lets the rest of the process run, whatever the clock says. */
const SLICE_WORK_BYTES = 1024 * 1024;
/** How often, in work, the clock and the caller are looked at between two pauses. */
const CHECK_WORK_BYTES = 16 * 1024;
/** How often, in calls, the clock and the caller are looked at between two pauses. */
const CHECK_CALLS = 64;
/** The piece of ASCII data that is decoded before the count looks at the time again. */
const DECODE_CHUNK_BYTES = 64 * 1024;

type Filter = "flate" | "hex" | "a85" | "other";

const FILTERS: Readonly<Record<string, Filter>> = {
  FlateDecode: "flate",
  Fl: "flate",
  ASCIIHexDecode: "hex",
  AHx: "hex",
  ASCII85Decode: "a85",
  A85: "a85",
};

export type StreamVerdict = "fits" | "too_big" | "too_slow" | "aborted";

/** What the count did, for tests and for a probe. */
export interface PdfScanStats {
  /** The bytes that were searched, read and decoded. */
  work: number;
  /** The most work the file was allowed. */
  budget: number;
  /** How often the count let the rest of the process run. */
  pauses: number;
  /** The most work done between two pauses. */
  longestSlice: number;
  /** The streams whose dictionary was read. */
  streams: number;
}

/** The end of the count, thrown from wherever it is decided. */
class ScanStop extends Error {
  constructor(readonly verdict: Exclude<StreamVerdict, "fits">) {
    super(verdict);
  }
}

/** The budget of the count, its clock, and the pauses that let the rest of the process run. */
class Work {
  spent = 0;
  pauses = 0;
  longestSlice = 0;
  streams = 0;
  private streamSpent = 0;
  private streamCap = Number.POSITIVE_INFINITY;
  private slice = 0;
  private sinceCheck = 0;
  private calls = 0;
  private sliceStart: number;
  private readonly began: number;

  constructor(
    readonly budget: number,
    private readonly timeoutMs: number,
    private readonly now: () => number,
    private readonly signal: AbortSignal | undefined,
  ) {
    this.began = now();
    this.sliceStart = this.began;
  }

  /** Work on the file: a search, an index, the data of a stream. */
  charge(bytes: number): void {
    this.spent += bytes;
    this.slice += bytes;
    this.sinceCheck += bytes;
    if (this.spent > this.budget) throw new ScanStop("too_slow");
  }

  /** Work on the objects of one stream: its dictionary and what it refers to. */
  chargeObject(bytes: number): void {
    this.streamSpent += bytes;
    this.charge(bytes);
    if (this.streamSpent > this.streamCap) throw new ScanStop("too_slow");
  }

  /** A new stream, whose objects may take `cap` bytes of reading. */
  beginStream(cap: number): void {
    this.streamSpent = 0;
    this.streamCap = cap;
  }

  /**
   * Whether the count should pause now. Looks at the caller and at the clock every so often, and
   * ends the count when either says so.
   */
  due(): boolean {
    this.calls += 1;
    if (this.slice >= SLICE_WORK_BYTES) return true;
    if (this.sinceCheck < CHECK_WORK_BYTES && this.calls % CHECK_CALLS !== 0) return false;
    this.sinceCheck = 0;
    return this.check() - this.sliceStart >= SLICE_MS;
  }

  /** Ends the count when the caller gave up or the time is up; the time otherwise. */
  check(): number {
    if (this.signal?.aborted) throw new ScanStop("aborted");
    const time = this.now();
    if (time - this.began > this.timeoutMs) throw new ScanStop("too_slow");
    return time;
  }

  /** When the slice of work began, by the clock of the count. */
  sliceStarted(): number {
    return this.sliceStart;
  }

  /** Lets the rest of the process run. */
  async pause(): Promise<void> {
    this.longestSlice = Math.max(this.longestSlice, this.slice);
    this.pauses += 1;
    await new Promise((resolve) => setImmediate(resolve));
    this.slice = 0;
    this.sinceCheck = 0;
    this.sliceStart = this.check();
  }
}

const isWhiteSpace = (byte: number) =>
  byte === 0x00 ||
  byte === 0x09 ||
  byte === 0x0a ||
  byte === 0x0c ||
  byte === 0x0d ||
  byte === 0x20;
const isDelimiter = (byte: number) =>
  byte === 0x28 ||
  byte === 0x29 ||
  byte === 0x3c ||
  byte === 0x3e ||
  byte === 0x5b ||
  byte === 0x5d ||
  byte === 0x7b ||
  byte === 0x7d ||
  byte === 0x2f ||
  byte === 0x25;
const isDigit = (byte: number) => byte >= 0x30 && byte <= 0x39;
const ends = (body: Buffer, at: number) =>
  at >= body.length || isWhiteSpace(body[at]) || isDelimiter(body[at]);

/**
 * Whether the bytes are a number: a sign, then digits with at most one point, at least one digit.
 * A loop, not a regular expression: a word can be as long as the file, and a backtracking test of
 * a long run of digits that ends in a letter takes a time that grows with the square of its length.
 */
function isNumber(body: Buffer, start: number, end: number): boolean {
  let at = start;
  if (at < end && (body[at] === 0x2b || body[at] === 0x2d)) at += 1;
  let digits = 0;
  let points = 0;
  for (; at < end; at += 1) {
    if (isDigit(body[at])) digits += 1;
    else if (body[at] === 0x2e && points === 0) points += 1;
    else return false;
  }
  return digits > 0;
}

type Token =
  | { kind: "<<" | ">>" | "[" | "]" | "other" }
  | { kind: "name"; value: string }
  | { kind: "number"; value: number }
  | { kind: "keyword"; value: string };

/** The tokens of a part of a PDF, enough of them to read a dictionary; each is charged as read. */
class Lexer {
  constructor(
    private readonly body: Buffer,
    public position: number,
    private readonly limit: number,
    private readonly work: Work,
  ) {}

  next(): Token | null {
    const from = this.position;
    const token = this.read();
    this.work.chargeObject(this.position - from);
    return token;
  }

  private read(): Token | null {
    const { body, limit } = this;
    while (this.position < limit) {
      const byte = body[this.position];
      if (isWhiteSpace(byte)) {
        this.position += 1;
      } else if (byte === 0x25) {
        while (
          this.position < limit &&
          body[this.position] !== 0x0a &&
          body[this.position] !== 0x0d
        ) {
          this.position += 1;
        }
      } else {
        break;
      }
    }
    if (this.position >= limit) return null;
    const start = this.position;
    const byte = body[start];
    if (byte === 0x3c && body[start + 1] === 0x3c) {
      this.position += 2;
      return { kind: "<<" };
    }
    if (byte === 0x3e && body[start + 1] === 0x3e) {
      this.position += 2;
      return { kind: ">>" };
    }
    if (byte === 0x5b || byte === 0x5d) {
      this.position += 1;
      return { kind: byte === 0x5b ? "[" : "]" };
    }
    if (byte === 0x3c) {
      // Searched in the part only: a `<` with no `>` must not send the search to the end of the file.
      const close = body.subarray(start, limit).indexOf(0x3e);
      this.position = close < 0 ? limit : start + close + 1;
      return { kind: "other" };
    }
    if (byte === 0x28) {
      this.skipLiteralString();
      return { kind: "other" };
    }
    if (byte === 0x2f) {
      this.position += 1;
      while (this.position < limit && !ends(body, this.position)) this.position += 1;
      // A long name stays a name, so that the dictionary holding it is still read; it cannot be
      // a key or a filter that the count looks for, so its text is not needed.
      if (this.position - start - 1 > MAX_WORD_CHARS) return { kind: "name", value: "" };
      return { kind: "name", value: decodeName(body.toString("latin1", start + 1, this.position)) };
    }
    this.position += 1;
    while (this.position < limit && !ends(body, this.position)) this.position += 1;
    if (isNumber(body, start, this.position)) {
      return { kind: "number", value: Number(body.toString("latin1", start, this.position)) };
    }
    if (this.position - start > MAX_WORD_CHARS) return { kind: "other" };
    return { kind: "keyword", value: body.toString("latin1", start, this.position) };
  }

  /** A `(...)` string: parentheses nest, and a backslash takes the byte after it as it is. */
  private skipLiteralString(): void {
    const { body, limit } = this;
    let depth = 0;
    while (this.position < limit) {
      const byte = body[this.position];
      this.position += 1;
      if (byte === 0x5c) this.position += 1;
      else if (byte === 0x28) depth += 1;
      else if (byte === 0x29 && --depth === 0) return;
    }
  }
}

/** A name as the library reads it: `#46` is `F`. */
function decodeName(raw: string): string {
  return raw.replace(/#([0-9A-Fa-f]{2})/g, (_escape, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

type Value =
  | { kind: "name"; value: string }
  | { kind: "number"; value: number }
  | { kind: "ref"; num: number; gen: number }
  | { kind: "array"; items: Value[] }
  | { kind: "dict"; entries: Map<string, Value> }
  | { kind: "other" };

/** The value that begins with `token`, or null when the text is not one the reader can follow. */
async function readValue(
  lexer: Lexer,
  token: Token,
  depth: number,
  work: Work,
): Promise<Value | null> {
  if (depth > MAX_NESTING) return null;
  switch (token.kind) {
    case "<<": {
      const entries = new Map<string, Value>();
      for (;;) {
        if (work.due()) await work.pause();
        const key = lexer.next();
        if (key === null) return null;
        if (key.kind === ">>") return { kind: "dict", entries };
        if (key.kind !== "name") return null;
        const first = lexer.next();
        if (first === null) return null;
        const value = await readValue(lexer, first, depth + 1, work);
        if (value === null) return null;
        // The library keeps the last of two entries with one key.
        entries.set(key.value, value);
      }
    }
    case "[": {
      const items: Value[] = [];
      for (;;) {
        if (work.due()) await work.pause();
        const first = lexer.next();
        if (first === null) return null;
        if (first.kind === "]") return { kind: "array", items };
        const value = await readValue(lexer, first, depth + 1, work);
        if (value === null) return null;
        items.push(value);
      }
    }
    case "number": {
      // `N G R` is a reference to an object; anything else leaves the number alone.
      const mark = lexer.position;
      const generation = lexer.next();
      const r = generation?.kind === "number" ? lexer.next() : null;
      if (generation?.kind === "number" && r?.kind === "keyword" && r.value === "R") {
        return { kind: "ref", num: token.value, gen: generation.value };
      }
      lexer.position = mark;
      return token;
    }
    case "name":
      return token;
    case ">>":
    case "]":
      return null;
    default:
      return { kind: "other" };
  }
}

/**
 * The object number and generation of a header `N G obj` whose `obj` is at `at`, read back no
 * further than `floor`; null when the bytes there are not such a header.
 */
function headerAt(body: Buffer, at: number, floor: number): string | null {
  if (!ends(body, at + 3)) return null;
  const fields: string[] = [];
  let cursor = at - 1;
  while (fields.length < 2) {
    const spaceEnd = cursor;
    while (cursor >= floor && isWhiteSpace(body[cursor])) cursor -= 1;
    if (cursor === spaceEnd) return null;
    const digitsEnd = cursor;
    while (cursor >= floor && isDigit(body[cursor])) cursor -= 1;
    if (cursor === digitsEnd) return null;
    fields.unshift(body.toString("latin1", cursor + 1, digitsEnd + 1));
  }
  if (cursor >= 0 && !isWhiteSpace(body[cursor]) && !isDelimiter(body[cursor])) return null;
  return `${Number(fields[0])} ${Number(fields[1])}`;
}

/**
 * Where the dictionary of the object holding `stream` at `keyword` begins: after the last header
 * `N G obj` between `floor` and the keyword; -1 when there is none. `floor` is where the search of
 * the stream before it ended, so that no byte is searched twice.
 */
async function objectHeaderBefore(
  body: Buffer,
  keyword: number,
  floor: number,
  work: Work,
): Promise<number> {
  // A search of the whole buffer would go on past `floor` to the start of the file, for every
  // keyword: the region is cut out first, so that the search stops where it may.
  const region = body.subarray(floor, keyword);
  let searched = region.length;
  let at = region.lastIndexOf("obj", region.length, "latin1");
  while (at >= 0) {
    work.charge(searched - at);
    searched = at;
    if (headerAt(body, floor + at, floor) !== null) return floor + at + 3;
    if (work.due()) await work.pause();
    at = at === 0 ? -1 : region.lastIndexOf("obj", at - 1, "latin1");
  }
  work.charge(searched);
  return -1;
}

/** The dictionary of the stream at `keyword`, or null when it cannot be read with certainty. */
async function dictionaryOf(
  body: Buffer,
  keyword: number,
  start: number,
  work: Work,
): Promise<Map<string, Value> | null> {
  const lexer = new Lexer(body, start, keyword, work);
  const first = lexer.next();
  if (first?.kind !== "<<") return null;
  const dictionary = await readValue(lexer, first, 0, work);
  // The dictionary must end where the keyword begins, white space aside.
  if (dictionary?.kind !== "dict" || lexer.next() !== null) return null;
  return dictionary.entries;
}

/** Where each object begins (after its `obj`), by `num gen`; the last definition wins, as in an updated file. */
async function indexObjects(body: Buffer, work: Work): Promise<Map<string, number>> {
  const index = new Map<string, number>();
  let at = body.indexOf("obj", 0, "latin1");
  let floor = 0;
  while (at >= 0) {
    work.charge(at + 3 - floor);
    const key = headerAt(body, at, floor);
    if (key !== null) index.set(key, at + 3);
    floor = at + 3;
    if (work.due()) await work.pause();
    at = body.indexOf("obj", floor, "latin1");
  }
  work.charge(body.length - floor);
  return index;
}

type Resolve = (value: Value | undefined) => Promise<Value | undefined>;

/**
 * A function that gives the value an indirect reference (`9 0 R`) points to, as the object holds
 * it, and any other value as it is; undefined for an object that cannot be found or read. The
 * objects are indexed on the first reference, and each one is read once; the reading is charged
 * to the stream that asks.
 */
function resolverOf(body: Buffer, work: Work): Resolve {
  let objects: Map<string, number> | undefined;
  const read = new Map<string, Value | undefined>();
  return async (value) => {
    if (value?.kind !== "ref") return value;
    const key = `${value.num} ${value.gen}`;
    if (read.has(key)) return read.get(key);
    objects ??= await indexObjects(body, work);
    const at = objects.get(key);
    let resolved: Value | undefined;
    if (at !== undefined) {
      const lexer = new Lexer(body, at, body.length, work);
      const first = lexer.next();
      resolved =
        first === null ? undefined : ((await readValue(lexer, first, 0, work)) ?? undefined);
      // A reference to a reference is not followed: no writer makes one for these entries.
      if (resolved?.kind === "ref") resolved = undefined;
    }
    read.set(key, resolved);
    return resolved;
  };
}

/**
 * Where the data of a stream begins: after the end of the line of `stream`, as the library skips
 * it. A loop up to the first line break, not a search for each kind of break: in a file that has
 * only one kind, the search for the other would run to the end of the file for every stream.
 */
function dataStart(body: Buffer, afterKeyword: number): number {
  let at = afterKeyword;
  while (at < body.length) {
    if (body[at] === 0x0d) return body[at + 1] === 0x0a ? at + 2 : at + 1;
    if (body[at] === 0x0a) return at + 1;
    at += 1;
  }
  return at;
}

/**
 * Where the data of a stream ends: after `length` bytes when `endstream` follows them, else at the
 * next `endstream`, a search that is charged.
 */
function dataEnd(body: Buffer, start: number, length: number | null, work: Work): number {
  if (length !== null && Number.isInteger(length) && length >= 0 && start + length <= body.length) {
    let at = start + length;
    while (at < body.length && isWhiteSpace(body[at])) at += 1;
    // Charged: the lengths of many streams can point into one long run of white space.
    work.charge(at - (start + length));
    if (body.toString("latin1", at, at + 9) === "endstream") return start + length;
  }
  const found = body.indexOf("endstream", start, "latin1");
  const end = found < 0 ? body.length : found;
  work.charge(end - start);
  return end;
}

/** The filters of a stream in the order they are undone, with the parameters of each. */
async function filtersOf(
  entries: Map<string, Value>,
  resolve: Resolve,
): Promise<Array<{ filter: Filter; params: Value | undefined }>> {
  // The library takes `/F` first, as an inline image abbreviates the key, then `/Filter`; and the
  // same for `/DP` and `/DecodeParms`.
  const filter = await resolve(entries.get("F") ?? entries.get("Filter"));
  const params = await resolve(entries.get("DP") ?? entries.get("DecodeParms"));
  if (filter?.kind === "name") return [{ filter: FILTERS[filter.value] ?? "other", params }];
  if (filter?.kind !== "array") return [];
  const filters: Array<{ filter: Filter; params: Value | undefined }> = [];
  for (let index = 0; index < filter.items.length; index += 1) {
    const name = await resolve(filter.items[index]);
    // The library refuses a filter that is not a name, and with it the stream.
    if (name?.kind !== "name") return [...filters, { filter: "other", params: undefined }];
    filters.push({
      filter: FILTERS[name.value] ?? "other",
      params: params?.kind === "array" ? await resolve(params.items[index]) : undefined,
    });
  }
  return filters;
}

/**
 * The bytes a predictor adds to what a FlateDecode stream inflates to: two rows, as the library
 * writes a whole row for the last piece of a row and makes room for a row before it finds the
 * data ended. 0 when no predictor applies. The values are read and multiplied as the library
 * does it, `>> 3` included, so that a width the library wraps to a small number is small here too.
 */
async function predictorBytes(params: Value | undefined, resolve: Resolve): Promise<number> {
  if (params?.kind !== "dict") return 0;
  const get = async (key: string, other?: string) =>
    resolve(
      params.entries.get(key) ?? (other === undefined ? undefined : params.entries.get(other)),
    );
  const predictor = await get("Predictor");
  if (predictor === undefined) return 0;
  if (predictor.kind === "number") {
    const value = predictor.value || 1;
    // Below 2 there is no predictor; a number the library does not know makes it refuse the stream.
    if (value <= 1 || (value !== 2 && (value < 10 || value > 15))) return 0;
  }
  // A predictor that is not a number is taken by the library as a PNG predictor.
  const numberOr = (value: Value | undefined, fallback: number) =>
    value === undefined ? fallback : value.kind === "number" ? value.value || fallback : Number.NaN;
  const colors = numberOr(await get("Colors"), 1);
  const bits = numberOr(await get("BPC", "BitsPerComponent"), 8);
  const columns = numberOr(await get("Columns"), 1);
  const rowBytes = (columns * colors * bits + 7) >> 3;
  return rowBytes > 0 ? 2 * rowBytes : 0;
}

/** Bytes that are written one at a time, never more than `cap`: past it, the stream is too big. */
class Sink {
  private buffer: Buffer;
  size = 0;

  constructor(
    expected: number,
    private readonly cap: number,
  ) {
    this.buffer = Buffer.alloc(Math.max(16, Math.min(expected, cap + 1)));
  }

  push(byte: number): void {
    if (this.size >= this.buffer.length) {
      if (this.size >= this.cap) throw new ScanStop("too_big");
      const grown = Buffer.alloc(Math.min(this.buffer.length * 2, this.cap + 1));
      this.buffer.copy(grown);
      this.buffer = grown;
    }
    this.buffer[this.size++] = byte;
    if (this.size > this.cap) throw new ScanStop("too_big");
  }

  bytes(): Buffer {
    return this.buffer.subarray(0, this.size);
  }
}

interface AsciiDecoder {
  /** Decodes `data[from, to)`; false once the end of the data has been met. */
  decode(data: Buffer, from: number, to: number, sink: Sink): boolean;
  finish(sink: Sink): void;
}

/** ASCIIHexDecode: white space is passed over, `>` ends the data, a lone last digit is followed by 0. */
function hexDecoder(): AsciiDecoder {
  let high = -1;
  return {
    decode(data, from, to, sink) {
      for (let at = from; at < to; at += 1) {
        const byte = data[at];
        if (byte === 0x3e) return false;
        const digit =
          byte >= 0x30 && byte <= 0x39
            ? byte - 0x30
            : byte >= 0x41 && byte <= 0x46
              ? byte - 0x37
              : byte >= 0x61 && byte <= 0x66
                ? byte - 0x57
                : -1;
        if (digit < 0) continue;
        if (high < 0) {
          high = digit;
        } else {
          sink.push((high << 4) | digit);
          high = -1;
        }
      }
      return true;
    },
    finish(sink) {
      if (high >= 0) sink.push(high << 4);
    },
  };
}

/** ASCII85Decode: white space is passed over, `z` is four zeros, `~` ends the data. */
function ascii85Decoder(): AsciiDecoder {
  const group: number[] = [];
  const flush = (count: number, sink: Sink) => {
    while (group.length < 5) group.push(84);
    let value = 0;
    for (const digit of group) value = value * 85 + digit;
    for (let index = 0; index < count - 1; index += 1) {
      sink.push((value >>> (24 - 8 * index)) & 0xff);
    }
    group.length = 0;
  };
  return {
    decode(data, from, to, sink) {
      for (let at = from; at < to; at += 1) {
        const byte = data[at];
        if (byte === 0x7e) return false;
        if (isWhiteSpace(byte)) continue;
        if (byte === 0x7a && group.length === 0) {
          for (let index = 0; index < 4; index += 1) sink.push(0);
          continue;
        }
        if (byte < 0x21 || byte > 0x75) continue;
        group.push(byte - 0x21);
        if (group.length === 5) flush(5, sink);
      }
      return true;
    },
    finish(sink) {
      if (group.length > 1) flush(group.length, sink);
    },
  };
}

function decodeAll(decoder: AsciiDecoder, data: Buffer, expected: number): Buffer {
  const sink = new Sink(expected, Number.MAX_SAFE_INTEGER);
  decoder.decode(data, 0, data.length, sink);
  decoder.finish(sink);
  return sink.bytes();
}

/** ASCIIHexDecode of the whole data at once. */
export function decodeAsciiHex(data: Buffer): Buffer {
  return decodeAll(hexDecoder(), data, Math.ceil(data.length / 2));
}

/** ASCII85Decode of the whole data at once. */
export function decodeAscii85(data: Buffer): Buffer {
  return decodeAll(ascii85Decoder(), data, data.length);
}

/**
 * The data decoded a piece at a time, charged as it goes and paused between pieces; `too_big`
 * when it gives more than `cap`, since the library holds it all as well.
 */
async function decodePieces(
  decoder: AsciiDecoder,
  data: Buffer,
  cap: number,
  work: Work,
): Promise<Buffer> {
  const sink = new Sink(data.length, cap);
  for (let at = 0; at < data.length; at += DECODE_CHUNK_BYTES) {
    const to = Math.min(data.length, at + DECODE_CHUNK_BYTES);
    const more = decoder.decode(data, at, to, sink);
    work.charge(to - at);
    if (!more) break;
    if (work.due()) await work.pause();
  }
  decoder.finish(sink);
  return sink.bytes();
}

/**
 * The bytes the deflate data of a FlateDecode stream inflates to: its size, which is above `cap`
 * when it gives more, the bytes of its data that zlib refused and did not take (`unread`), and its
 * bytes when `keep` (for the next filter), never more than `cap`. The data is inflated on the
 * thread pool of zlib, in pieces, so the event loop only adds them up.
 */
async function inflate(
  data: Buffer,
  cap: number,
  keep: boolean,
): Promise<{ size: number; unread: number; bytes: Buffer }> {
  const empty = { size: 0, unread: 0, bytes: Buffer.alloc(0) };
  if (data.length < 2) return empty;
  const [cmf, flg] = data;
  // The library refuses these headers, and then inflates nothing.
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) + flg) % 31 !== 0 || (flg & 0x20) !== 0) return empty;
  const raw = data.subarray(2);
  return new Promise((resolve) => {
    const inflater = zlib.createInflateRaw({
      dictionary: ZERO_WINDOW,
      finishFlush: zlib.constants.Z_SYNC_FLUSH,
    });
    const pieces: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (unread: number) => {
      if (settled) return;
      settled = true;
      inflater.destroy();
      resolve({
        size,
        unread,
        bytes: keep && size <= cap ? Buffer.concat(pieces) : Buffer.alloc(0),
      });
    };
    inflater.on("data", (piece: Buffer) => {
      size += piece.length;
      if (keep && size <= cap) pieces.push(piece);
      if (size > cap) finish(0);
    });
    inflater.on("end", () => finish(0));
    // `bytesWritten` is what zlib took before the fault.
    inflater.on("error", () => finish(Math.max(0, raw.length - inflater.bytesWritten)));
    inflater.on("close", () => finish(0));
    inflater.end(raw);
  });
}

export interface PdfStreamOptions extends PdfStreamLimits {
  /** The longest the count may take, in ms. */
  timeoutMs: number;
  signal?: AbortSignal;
  /** The clock, for tests. */
  now?: () => number;
  /** Filled with what the count did, when given. */
  stats?: PdfScanStats;
}

/**
 * Whether the FlateDecode streams of the PDF inflate within the limits (see the top of the file):
 * `too_big` as soon as one stream, or all of them together, would give more; `too_slow` when the
 * count takes more than its budget of work or `timeoutMs`; `aborted` when the caller gives up.
 */
export async function checkPdfStreams(
  body: Buffer,
  options: PdfStreamOptions,
): Promise<StreamVerdict> {
  const { timeoutMs, signal, now = Date.now, stats } = options;
  const work = new Work(
    WORK_PER_FILE_BYTE * body.length + WORK_FLOOR_BYTES,
    timeoutMs,
    now,
    signal,
  );
  try {
    await countStreams(body, options, work);
    return "fits";
  } catch (error) {
    if (error instanceof ScanStop) return error.verdict;
    throw error;
  } finally {
    if (stats !== undefined) {
      stats.work = work.spent;
      stats.budget = work.budget;
      stats.pauses = work.pauses;
      stats.longestSlice = work.longestSlice;
      stats.streams = work.streams;
    }
  }
}

async function countStreams(body: Buffer, limits: PdfStreamLimits, work: Work): Promise<void> {
  const { maxStreamBytes, maxTotalBytes } = limits;
  const resolve = resolverOf(body, work);
  let encrypted: boolean | undefined;
  // Looked for once, when zlib first refuses data: a file that names /Encrypt anywhere is taken as
  // encrypted. Naming it in a file that is not gains nothing a real encryption would not.
  const isEncrypted = () => {
    if (encrypted === undefined) {
      work.charge(body.length);
      encrypted = body.indexOf("/Encrypt", 0, "latin1") >= 0;
    }
    return encrypted;
  };
  let total = 0;
  let from = 0;
  for (;;) {
    // The clock is read for every stream, so that work that is not charged (a stream with no
    // filter costs a few lookups) still ends in a pause.
    if (work.due() || work.check() - work.sliceStarted() >= SLICE_MS) await work.pause();

    const keyword = body.indexOf("stream", from, "latin1");
    if (keyword < 0) {
      work.charge(body.length - from);
      return;
    }
    work.charge(keyword + 6 - from);
    const floor = from;
    from = keyword + 6;
    // `stream` as a word of its own, after a dictionary or white space (not `endstream`).
    const before = keyword > 0 ? body[keyword - 1] : 0x20;
    if (!(isWhiteSpace(before) || before === 0x3e) || !ends(body, keyword + 6)) continue;

    work.beginStream(Number.POSITIVE_INFINITY);
    const header = await objectHeaderBefore(body, keyword, floor, work);
    if (header < 0) continue;
    // The dictionary is read whatever its length; what it refers to has a budget of its own.
    work.beginStream(keyword - header + WORK_PER_STREAM_BYTES);
    const entries = await dictionaryOf(body, keyword, header, work);
    if (entries === null) continue;
    work.streams += 1;
    const start = dataStart(body, keyword + 6);
    const lengthValue = await resolve(entries.get("Length"));
    const end = dataEnd(
      body,
      start,
      lengthValue?.kind === "number" ? lengthValue.value : null,
      work,
    );
    work.charge(start - (keyword + 6));
    // The data of a stream is not searched for more streams.
    from = Math.max(from, end);

    const filters = await filtersOf(entries, resolve);
    const lastFlate = filters.map(({ filter }) => filter).lastIndexOf("flate");
    if (lastFlate < 0) continue;
    let data = body.subarray(start, end);
    for (let index = 0; index <= lastFlate; index += 1) {
      const { filter, params } = filters[index];
      const cap = Math.min(maxStreamBytes, maxTotalBytes - total);
      if (filter === "hex") {
        data = await decodePieces(hexDecoder(), data, cap, work);
      } else if (filter === "a85") {
        data = await decodePieces(ascii85Decoder(), data, cap, work);
      } else if (filter === "flate") {
        work.charge(data.length);
        const extra = await predictorBytes(params, resolve);
        if (extra > cap) throw new ScanStop("too_big");
        const inflated = await inflate(data, cap - extra, index < lastFlate);
        work.check();
        // What zlib refused and did not take is counted at the most deflate can give: the library
        // may read it (see the top of the file). Not in an encrypted file, whose data is not
        // deflate data before the library decrypts it, so that zlib refuses it by chance.
        let size = inflated.size + extra;
        if (inflated.unread > 0 && !isEncrypted()) size += inflated.unread * MAX_DEFLATE_RATIO;
        if (size > cap) throw new ScanStop("too_big");
        total += size;
        data = inflated.bytes;
      } else {
        break;
      }
    }
  }
}
