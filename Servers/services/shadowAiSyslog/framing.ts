/**
 * Syslog stream framing (RFC 6587).
 *
 * Handles octet counting ("<len> <msg>") and newline-delimited (LF or CRLF)
 * messages on the same stream. A frame that starts with a digit run followed
 * by a space is octet counted; anything else is newline-delimited.
 */

const OCTET_PREFIX_RE = /^(\d{1,7}) /;
const DIGITS_ONLY_RE = /^\d{0,7}$/;
const LF = 0x0a;

export class SyslogFramer {
  private buffer: Buffer = Buffer.alloc(0);
  // Bytes of an oversized octet-counted frame still to be thrown away.
  private skipBytes = 0;
  // True while throwing away the rest of an oversized newline-delimited line.
  private discardingLine = false;

  constructor(private readonly maxMessageBytes = 65536) {}

  /**
   * Feed a chunk from the socket. Returns the complete messages it finished
   * and how many oversized messages were discarded.
   */
  push(chunk: Buffer): { messages: string[]; oversized: number } {
    const messages: string[] = [];
    let oversized = 0;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    for (;;) {
      if (this.skipBytes > 0) {
        const n = Math.min(this.skipBytes, this.buffer.length);
        this.buffer = this.buffer.subarray(n);
        this.skipBytes -= n;
        if (this.skipBytes > 0) break;
      }

      if (this.discardingLine) {
        const nl = this.buffer.indexOf(LF);
        if (nl === -1) {
          this.buffer = Buffer.alloc(0);
          break;
        }
        this.buffer = this.buffer.subarray(nl + 1);
        this.discardingLine = false;
      }

      if (this.buffer.length === 0) break;

      // Octet counting only needs the first few bytes to be recognised.
      const head = this.buffer.subarray(0, 9).toString("latin1");
      const octet = OCTET_PREFIX_RE.exec(head);
      if (octet) {
        const len = Number(octet[1]);
        const start = octet[0].length;
        if (len > this.maxMessageBytes) {
          oversized++;
          this.buffer = this.buffer.subarray(start);
          this.skipBytes = len;
          continue;
        }
        if (this.buffer.length < start + len) break;
        const text = this.buffer.toString("utf8", start, start + len);
        this.buffer = this.buffer.subarray(start + len);
        const trimmed = text.replace(/[\r\n]+$/, "");
        if (trimmed.length > 0) messages.push(trimmed);
        continue;
      }

      // Could still turn into an octet prefix once more bytes arrive.
      if (DIGITS_ONLY_RE.test(head) && this.buffer.indexOf(LF) === -1) break;

      const nl = this.buffer.indexOf(LF);
      if (nl === -1) {
        if (this.buffer.length > this.maxMessageBytes) {
          oversized++;
          this.buffer = Buffer.alloc(0);
          this.discardingLine = true;
        }
        break;
      }
      const line = this.buffer.subarray(0, nl);
      this.buffer = this.buffer.subarray(nl + 1);
      if (line.length > this.maxMessageBytes) {
        oversized++;
        continue;
      }
      const text = line.toString("utf8").replace(/\r$/, "");
      if (text.length > 0) messages.push(text);
    }

    return { messages, oversized };
  }
}
