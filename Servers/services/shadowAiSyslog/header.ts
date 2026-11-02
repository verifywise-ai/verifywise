/**
 * Syslog header stripping for RFC 5424 and RFC 3164 messages.
 *
 * Lines without a header (Squid access logs, for example) are returned as is.
 */

// <PRI>VERSION TIMESTAMP HOST APP PROCID MSGID STRUCTURED-DATA [MSG]
const RFC5424_RE =
  /^<\d{1,3}>\d{1,2} (\S+) \S+ \S+ \S+ \S+ (?:-|(?:\[(?:[^\]\\]|\\.)*\])+) ?([\s\S]*)$/;
// <PRI>Mmm dd hh:mm:ss HOST TAG: MSG
const RFC3164_RE = /^<\d{1,3}>([A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d) \S+ ([\s\S]*)$/;
// Conservative tag: a letter-led token (no `=`, `{` or quotes) and a colon
// followed by whitespace. Anything else is a tag-less body and stays intact.
const RFC3164_TAG_RE = /^[A-Za-z][\w./-]*(?:\[\d+\])?:\s+/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * RFC 3164 timestamps carry no year or zone. Read them as UTC in the current
 * year, or the previous one when that would land more than a day ahead.
 */
function parse3164Timestamp(raw: string, now: Date): string | undefined {
  const month = MONTHS.indexOf(raw.slice(0, 3));
  const day = Number(raw.slice(4, 6));
  const [hh, mm, ss] = raw.slice(7).split(":").map(Number);
  if (month === -1) return undefined;
  let year = now.getUTCFullYear();
  let ts = Date.UTC(year, month, day, hh, mm, ss);
  if (ts - now.getTime() > 24 * 60 * 60 * 1000) {
    year -= 1;
    ts = Date.UTC(year, month, day, hh, mm, ss);
  }
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function stripSyslogHeader(
  msg: string,
  now: Date = new Date(),
): { body: string; headerTimestamp?: string } {
  const m5424 = RFC5424_RE.exec(msg);
  if (m5424) {
    const parsed = m5424[1] === "-" ? NaN : Date.parse(m5424[1]);
    return {
      body: m5424[2],
      headerTimestamp: Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString(),
    };
  }

  const m3164 = RFC3164_RE.exec(msg);
  if (m3164) {
    return {
      body: m3164[2].replace(RFC3164_TAG_RE, ""),
      headerTimestamp: parse3164Timestamp(m3164[1], now),
    };
  }

  return { body: msg };
}
