/**
 * A small zip writer for the tests of the zip reader (zip.ts): stored and deflate entries, the
 * records of Zip64 on request, and the lies a hostile file tells (a method nobody knows, a size
 * the data does not have, the flag of an encrypted entry). It follows the layout of PKWARE's
 * APPNOTE: a local header and the data of each entry, the central directory, its end.
 */
import zlib from "zlib";

export interface WriterEntry {
  name: string;
  data: Buffer | string;
  /** 0 stored, 8 deflate (the default); any other number is written as it is, over stored data. */
  method?: number;
  /** The inflated size the headers give, in place of the true one. */
  claimedSize?: number;
  /** The CRC-32 the headers give, in place of the true one. */
  claimedCrc?: number;
  /** The general purpose flags, in place of 0x0800 (names in UTF-8). */
  flags?: number;
  /** Bytes after the compressed data, counted in its size: a deflate stream ends before them. */
  trailing?: Buffer;
}

export interface WriterOptions {
  /** Writes the Zip64 end of central directory, its locator and the Zip64 fields of every entry. */
  zip64?: boolean;
  comment?: string;
}

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;

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

/** A zip of the entries, in their order. */
export function writeZip(entries: readonly WriterEntry[], options: WriterOptions = {}): Buffer {
  const zip64 = options.zip64 === true;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const method = entry.method ?? 8;
    const stored = Buffer.concat([
      method === 8 ? zlib.deflateRawSync(data) : data,
      entry.trailing ?? Buffer.alloc(0),
    ]);
    const size = entry.claimedSize ?? data.length;
    const crc = entry.claimedCrc ?? zlib.crc32(data);
    const name = Buffer.from(entry.name, "utf8");
    const flags = entry.flags ?? 0x0800;
    const version = zip64 ? 45 : 20;

    const localExtra = zip64
      ? Buffer.concat([u16(0x0001), u16(16), u64(size), u64(stored.length)])
      : Buffer.alloc(0);
    locals.push(
      Buffer.concat([
        u32(0x04034b50),
        u16(version),
        u16(flags),
        u16(method),
        u16(0),
        u16(0x21),
        u32(crc),
        u32(zip64 ? MAX32 : stored.length),
        u32(zip64 ? MAX32 : size),
        u16(name.length),
        u16(localExtra.length),
        name,
        localExtra,
        stored,
      ]),
    );

    const centralExtra = zip64
      ? Buffer.concat([u16(0x0001), u16(24), u64(size), u64(stored.length), u64(offset)])
      : Buffer.alloc(0);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(version),
        u16(version),
        u16(flags),
        u16(method),
        u16(0),
        u16(0x21),
        u32(crc),
        u32(zip64 ? MAX32 : stored.length),
        u32(zip64 ? MAX32 : size),
        u16(name.length),
        u16(centralExtra.length),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(zip64 ? MAX32 : offset),
        name,
        centralExtra,
      ]),
    );
    offset += locals[locals.length - 1].length;
  }

  const directory = Buffer.concat(centrals);
  const comment = Buffer.from(options.comment ?? "", "utf8");
  const tail: Buffer[] = [];
  if (zip64) {
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
      u16(zip64 ? MAX16 : entries.length),
      u16(zip64 ? MAX16 : entries.length),
      u32(zip64 ? MAX32 : directory.length),
      u32(zip64 ? MAX32 : offset),
      u16(comment.length),
      comment,
    ]),
  );
  return Buffer.concat([...locals, directory, ...tail]);
}
