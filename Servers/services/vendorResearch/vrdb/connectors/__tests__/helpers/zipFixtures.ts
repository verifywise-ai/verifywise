/**
 * Synthetic zips for the tests of the two NHTSA lists (nhtsaFlat.test.ts, nhtsaOdi.test.ts,
 * nhtsaRecalls.test.ts). A zip is written by hand as PKWARE's APPNOTE lays it out (the local header
 * and the data of each entry, the central directory, its end record), so that a test can say exactly
 * what is wrong with it: general purpose bit 3 and a data descriptor (the real files have both: the
 * local header holds zero sizes, and the sizes are in the central directory), an encrypted flag, a
 * method nobody reads, a size or a CRC that the data does not have, a stream that is cut, and a
 * Zip64 marker in the sizes of the directory, in an extra field, or in the end record.
 *
 * Every entry is invented by the test; nothing here reads a real file. `helpers/` is not a test
 * directory: jest ignores it as a place for tests.
 */
import zlib from "zlib";

export interface ZipEntrySpec {
  name: string;
  /** What the entry inflates to; empty by default. */
  data?: Buffer | string;
  /** The bytes that follow the local header, in place of the data deflated (a cut stream, bytes that are no stream). */
  stored?: Buffer;
  /** 8 deflate (the default), 0 stored; any other number is written as it is, over stored data. */
  method?: number;
  /** The general purpose flags, in place of 0x0800 (names in UTF-8). Bit 0 says that the entry is encrypted. */
  flags?: number;
  /** General purpose bit 3: the local header holds no CRC and no sizes, and a data descriptor follows the data. */
  descriptor?: boolean;
  /** The inflated size that the directory gives, in place of the true one. */
  size?: number;
  /** The CRC-32 that the directory gives, in place of the true one. */
  crc?: number;
  /** A Zip64 extra field (id 1) on the central header, holding the two sizes; the 32-bit sizes stay as they are. */
  zip64Extra?: boolean;
  /** As `zip64Extra`, and the two 32-bit sizes of the central header are 0xFFFFFFFF, as a Zip64 writer leaves them. */
  zip64Sizes?: boolean;
}

export interface ZipOptions {
  /** The Zip64 end of central directory, its locator, and the 0xFFFF and 0xFFFFFFFF fields of the end record. */
  zip64End?: boolean;
  comment?: string;
}

const MAX16 = 0xffff;
const MAX32 = 0xffffffff;

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function u64(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

const bytesOf = (data: Buffer | string | undefined): Buffer =>
  typeof data === "string" ? Buffer.from(data, "utf8") : (data ?? Buffer.alloc(0));

/** A zip of the entries, in their order. */
export function zipOf(entries: readonly ZipEntrySpec[], options: ZipOptions = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const data = bytesOf(entry.data);
    const method = entry.method ?? 8;
    const stored = entry.stored ?? (method === 8 ? zlib.deflateRawSync(data) : data);
    const name = Buffer.from(entry.name, "utf8");
    const descriptor = entry.descriptor === true;
    const flags = (entry.flags ?? 0x0800) | (descriptor ? 0x0008 : 0);
    const size = entry.size ?? data.length;
    const crc = entry.crc ?? zlib.crc32(data);

    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(method),
      u16(0),
      u16(0x21),
      u32(descriptor ? 0 : crc),
      u32(descriptor ? 0 : stored.length),
      u32(descriptor ? 0 : size),
      u16(name.length),
      u16(0),
      name,
      stored,
      descriptor
        ? Buffer.concat([u32(0x08074b50), u32(crc), u32(stored.length), u32(size)])
        : Buffer.alloc(0),
    ]);

    const wide = entry.zip64Extra === true || entry.zip64Sizes === true;
    const extra = wide
      ? Buffer.concat([u16(0x0001), u16(16), u64(size), u64(stored.length)])
      : Buffer.alloc(0);
    const sizes =
      entry.zip64Sizes === true ? [u32(MAX32), u32(MAX32)] : [u32(stored.length), u32(size)];
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(wide ? 45 : 20),
        u16(wide ? 45 : 20),
        u16(flags),
        u16(method),
        u16(0),
        u16(0x21),
        u32(crc),
        ...sizes,
        u16(name.length),
        u16(extra.length),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
        extra,
      ]),
    );
    locals.push(local);
    offset += local.length;
  }

  const directory = Buffer.concat(centrals);
  const comment = Buffer.from(options.comment ?? "", "utf8");
  const wideEnd = options.zip64End === true;
  const tail: Buffer[] = [];
  if (wideEnd) {
    const recordAt = offset + directory.length;
    tail.push(
      Buffer.concat([
        u32(0x06064b50),
        u64(44),
        u16(45),
        u16(45),
        u32(0),
        u32(0),
        u64(entries.length),
        u64(entries.length),
        u64(directory.length),
        u64(offset),
      ]),
      Buffer.concat([u32(0x07064b50), u32(0), u64(recordAt), u32(1)]),
    );
  }
  tail.push(
    Buffer.concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(wideEnd ? MAX16 : entries.length),
      u16(wideEnd ? MAX16 : entries.length),
      u32(wideEnd ? MAX32 : directory.length),
      u32(wideEnd ? MAX32 : offset),
      u16(comment.length),
      comment,
    ]),
  );
  return Buffer.concat([...locals, directory, ...tail]);
}

/**
 * The zip of a flat file as NHTSA serves it: one entry, deflated, with general purpose bit 3 and a
 * data descriptor, so that its local header holds no sizes and only the central directory has them.
 */
export const flatZip = (name: string, content: Buffer | string): Buffer =>
  zipOf([{ name, data: content, descriptor: true }]);
