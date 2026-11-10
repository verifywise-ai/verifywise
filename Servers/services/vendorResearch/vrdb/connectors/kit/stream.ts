/**
 * The stream readers of the list kit: what a connector reads a list of hundreds of megabytes of
 * tab-separated text with, without ever holding the text. The two lists of NHTSA are zips that inflate
 * to 390.6 MB and 312.8 MB: held whole, one costs about 0.7 GB, and read as a stream (`streamZipEntry`
 * of vrdb/zip.ts into these) about a seventh of that. Three pieces: the splitter of bytes into lines
 * (`LineSplitter`), the reader of the fields of a line of bytes (`tabFieldsOf`), and the day of the
 * flat files, written without separators (`compactDayText`).
 *
 * All of it treats the bytes as hostile and reads them once, from the front, in time linear in their
 * length. A line is never longer in memory than the limit of its caller, a line of any number of
 * tabs costs one glance, and a field that nobody asked for is never decoded.
 */
import { BodyTooLargeError } from "../types";
import { dayText } from "./clean";

const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const TAB = 0x09;
const CARRIAGE_RETURN_BYTES = Buffer.from([CARRIAGE_RETURN]);
/** The smallest buffer that holds the part of a line that was cut by the end of a chunk. */
const CARRY_MIN_BYTES = 256;

export interface LineLimits {
  /** The most lines: the next one, null ones and blank ones counted, is a `BodyTooLargeError`. */
  maxLines: number;
  /** The most bytes of one line, without its LF and the CR before it; a longer line is a null. */
  maxLineBytes: number;
}

const isCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/**
 * Splits chunks of bytes into lines at LF, as they come, and holds nothing but the part of a line
 * that the end of a chunk cut.
 *
 * `onLine` gets each line without its LF and without the one CR before the LF (a CR in the line, or
 * a second one before the LF, is a byte of it; so is a CR at the end of the last line, which has no
 * LF for it to precede). A blank line is an empty Buffer. The Buffer of a line is valid only during
 * the call: decode or copy what you keep. It is a view and never a copy: a line that lies whole in
 * one chunk is a view of that chunk (it changes if the caller writes over the chunk), and a line that
 * two chunks carried, like the last line that no LF ends, is a view of the splitter's own buffer,
 * which the next such line is written over from its first byte. A Buffer that is kept can show
 * other bytes later, without a word, even after `end()` (the tests keep four lines and find the
 * last one four times; a line that makes the splitter's buffer grow leaves the older views as they
 * were, which is luck and not a promise). Decoding it (`toString`, `tabFieldsOf`) or
 * `Buffer.from(line)` is the copy.
 *
 * A line longer than `maxLineBytes` is given as ONE `null`, when its LF comes (or at the end), and
 * its bytes are dropped as they come: the splitter never holds more than `maxLineBytes` bytes of
 * one line, and a line of 20 MB costs one pass; the lines after it are given as before.
 *
 * A line is the same whatever the chunks that carry it: cut anywhere, a CRLF between its CR and its
 * LF included, and a chunk that ends right after an LF. `lines` counts the lines given, null ones
 * and blank ones included, and counts the line that is being given while `onLine` runs. The line
 * past `maxLines` is not given: `push` or `end` throws a `BodyTooLargeError` instead.
 *
 * After the end, after that error, and after an error of `onLine` (which comes out of `push` or
 * `end` as it was thrown) the splitter is spent: `push` and `end` do nothing, deliver nothing and
 * throw nothing, so that `end()` may be called twice and a late `push` is ignored.
 *
 * A mistake of the caller, a limit that is no whole number of zero or more, is a RangeError.
 */
export class LineSplitter {
  private delivered = 0;
  private spent = false;
  /** The part of the line that is not complete, in `carry[0, carried)`: at most `maxLineBytes`. */
  private carry: Buffer = Buffer.alloc(0);
  private carried = 0;
  /**
   * A CR that ended the bytes pushed so far, held back: it is dropped if the next byte is the LF,
   * and a byte of the line if it is not. It is the only byte that is held outside the carry.
   */
  private pendingCr = false;
  /** The line has passed `maxLineBytes`: what comes is dropped until its LF. */
  private dropping = false;

  /**
   * @param limits The most lines, and the most bytes of one line.
   * @param onLine Gets each line as a Buffer, or `null` for a line longer than `maxLineBytes`. The
   *   Buffer of a line is valid only during the call: decode or copy what you keep. It is a view of
   *   the chunk or of the splitter's own buffer, never a copy, so a Buffer that is kept can show the
   *   bytes of a later line, or of what the caller wrote over its chunk, even after `end()`.
   */
  constructor(
    private readonly limits: LineLimits,
    private readonly onLine: (line: Buffer | null) => void,
  ) {
    if (!isCount(limits.maxLines) || !isCount(limits.maxLineBytes)) {
      throw new RangeError("The limits of lines are whole numbers of zero or more.");
    }
  }

  /** The lines given so far, null ones included. */
  get lines(): number {
    return this.delivered;
  }

  /** Gives the lines that the chunk completes. The chunk is not kept: what is held is copied. */
  push(chunk: Buffer): void {
    if (this.spent) return;
    try {
      let from = 0;
      while (from < chunk.length) {
        const lf = chunk.indexOf(LINE_FEED, from);
        if (lf < 0) {
          this.hold(chunk, from, chunk.length);
          return;
        }
        this.finish(chunk, from, lf);
        from = lf + 1;
      }
    } catch (error) {
      this.spent = true;
      throw error;
    }
  }

  /**
   * Gives the last line, which has no LF, unless it is empty; the splitter is then spent. A second
   * call, and a `push` after it, do nothing.
   */
  end(): void {
    if (this.spent) return;
    this.spent = true;
    // The last line has no LF for a CR to precede: a CR held at its end is a byte of it.
    if (this.pendingCr && !this.dropping) this.add(CARRIAGE_RETURN_BYTES, 0, 1);
    const line = this.dropping
      ? null
      : this.carried > 0
        ? this.carry.subarray(0, this.carried)
        : undefined;
    this.carried = 0;
    this.pendingCr = false;
    this.dropping = false;
    if (line !== undefined) this.emit(line);
  }

  /** The bytes `[from, to)` of the chunk are part of the line that goes on: no LF is among them. */
  private hold(chunk: Buffer, from: number, to: number): void {
    if (this.dropping) return;
    if (this.pendingCr) {
      // A byte follows the CR that was held, and it is no LF: the CR is a byte of the line.
      this.pendingCr = false;
      this.add(CARRIAGE_RETURN_BYTES, 0, 1);
      if (this.dropping) return;
    }
    // A CR that ends these bytes is the one before the LF, if the next chunk opens with it.
    const stop = chunk[to - 1] === CARRIAGE_RETURN ? to - 1 : to;
    this.pendingCr = stop < to;
    this.add(chunk, from, stop);
  }

  /** The line ends at the LF that is at `lf`; its bytes in this chunk are `[from, lf)`. */
  private finish(chunk: Buffer, from: number, lf: number): void {
    // The bytes of the line in this chunk end before the CR that precedes the LF, if there is one.
    const stop = lf > from && chunk[lf - 1] === CARRIAGE_RETURN ? lf - 1 : lf;
    if (!this.dropping && this.carried === 0 && !this.pendingCr) {
      // The whole line is in this chunk: a view of it, and nothing is copied.
      this.emit(stop - from > this.limits.maxLineBytes ? null : chunk.subarray(from, stop));
      return;
    }
    if (!this.dropping) {
      if (this.pendingCr) {
        this.pendingCr = false;
        // The CR that was held is the one before this LF if the LF is the first byte here.
        if (lf > from) this.add(CARRIAGE_RETURN_BYTES, 0, 1);
      }
      if (!this.dropping) this.add(chunk, from, stop);
    }
    const line = this.dropping ? null : this.carry.subarray(0, this.carried);
    this.carried = 0;
    this.pendingCr = false;
    this.dropping = false;
    this.emit(line);
  }

  /** Adds the bytes `[from, to)` of `source` to the part of the line held, or starts dropping it. */
  private add(source: Buffer, from: number, to: number): void {
    const length = to - from;
    if (length === 0) return;
    if (this.carried + length > this.limits.maxLineBytes) {
      this.dropping = true;
      this.carried = 0;
      this.pendingCr = false;
      return;
    }
    if (this.carried + length > this.carry.length) {
      const room = Math.max(this.carried + length, this.carry.length * 2, CARRY_MIN_BYTES);
      const grown = Buffer.allocUnsafe(Math.min(this.limits.maxLineBytes, room));
      this.carry.copy(grown, 0, 0, this.carried);
      this.carry = grown;
    }
    source.copy(this.carry, this.carried, from, to);
    this.carried += length;
  }

  /** Gives a line to the caller, or throws for the line past the limit of lines. */
  private emit(line: Buffer | null): void {
    if (this.delivered >= this.limits.maxLines) throw new BodyTooLargeError();
    this.delivered += 1;
    this.onLine(line);
  }
}

/** Decodes bytes as UTF-8 and throws for bytes that are not; a byte order mark is kept, not dropped. */
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The text of the bytes, or null when they are not UTF-8: only the decoding is guarded, as it is all that can fail. */
function textOf(bytes: Buffer): string | null {
  try {
    return DECODER.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The text of the chosen fields of a tab-separated line of bytes, in the order asked for; null for a
 * line that is not of exactly `width` fields, and null for a line whose chosen field is not UTF-8
 * (the caller counts the row as unreadable). `wanted` are 1-based field numbers in ascending order,
 * each within `width`: anything else is a RangeError, whatever the line, since it is a mistake of
 * the caller.
 *
 * The shape is read first, in one pass that looks for the tabs one after the other and stops at
 * once when the line has more than `width - 1` of them, so that a line of ten million tabs costs a
 * glance, and nothing that grows with the line is allocated. Only the fields asked for are decoded (a UTF-8 decoder that throws on
 * bad bytes), and only for a line of the right shape: a field that is not asked for may hold any
 * bytes, and is never decoded. A field is the bytes between two tabs as they are: a CR at the end of
 * the line is the splitter's to drop, not this reader's.
 */
export function tabFieldsOf(
  line: Buffer,
  width: number,
  wanted: readonly number[],
): string[] | null {
  if (!Number.isInteger(width) || width < 1)
    throw new RangeError("The width is a whole number above zero.");
  for (let index = 0; index < wanted.length; index += 1) {
    const field = wanted[index];
    if (
      !Number.isInteger(field) ||
      field < 1 ||
      field > width ||
      (index > 0 && field <= wanted[index - 1])
    ) {
      throw new RangeError(
        "The fields asked for are whole numbers in ascending order within the width.",
      );
    }
  }
  // Where each field asked for starts and ends, until the line is known to be of the width.
  const places: number[] = [];
  let next = 0;
  let start = 0;
  for (let field = 1; field <= width; field += 1) {
    const tab = line.indexOf(TAB, start);
    // The last field must hold no tab; the others must end in one.
    if (field < width ? tab < 0 : tab >= 0) return null;
    const end = field < width ? tab : line.length;
    if (next < wanted.length && wanted[next] === field) {
      places.push(start, end);
      next += 1;
    }
    start = end + 1;
  }
  const fields: string[] = [];
  for (let at = 0; at < places.length; at += 2) {
    const text = textOf(line.subarray(places[at], places[at + 1]));
    if (text === null) return null;
    fields.push(text);
  }
  return fields;
}

const COMPACT_DAY = /^[0-9]{8}$/;

/**
 * "20240131" as "2024-01-31" when it is a real day, otherwise null: exactly eight ASCII digits, and
 * a day that exists by the kit's own rule (`dayText` of clean.ts, so that one rule decides what a day
 * is: the year 0000 is none, 29 February is one in a leap year). Nothing else is read: not seven or
 * nine digits, not a blank around it, not a value that is no text. A year below 1000 is whatever
 * `dayText` says of it.
 */
export function compactDayText(text: unknown): string | null {
  if (typeof text !== "string" || text.length !== 8 || !COMPACT_DAY.test(text)) return null;
  return dayText(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`);
}
