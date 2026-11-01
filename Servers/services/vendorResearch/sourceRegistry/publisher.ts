/**
 * The publisher behind an address: the key under which two sources count as one. One story on
 * `bbc.co.uk` and on `bbc.com` is one publisher and not two, and so are the pages of a news site's
 * sections. The source registry gives it as the key of independence of a source that no entry
 * names (classify.ts), and the research reads the news of different publishers first (gather.ts).
 *
 * The credibility rule asks for two independent publishers (see credibility.ts), and the errors of
 * this key are not alike. A key that merges two publishers lowers a label (safe): `acme.com` and
 * `acme.org` count as one, and so do all the tenants of a hosting platform (`a.github.io` and
 * `b.github.io`). A key that split one publisher in two would raise a label, which is why the key
 * goes by the name of the site and ignores the top-level domain.
 *
 * It moved here from sourceTiers.ts, which went with the confidence rules (M3 Part B).
 */

/** The labels in front of a top-level domain that are not a name: bbc.co.uk and bbc.com are one. */
const SECOND_LEVEL_LABELS: ReadonlySet<string> = new Set([
  "co",
  "com",
  "org",
  "net",
  "gov",
  "ac",
  "edu",
]);

/**
 * The publisher behind an address: the name label of its host, without "www.", the top-level domain
 * and a second-level label such as "co" or "com". It is null for text that is not an address.
 */
export function publisherKey(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const labels = host.split(".");
  if (labels.length < 2) return host;
  labels.pop();
  if (labels.length > 1 && SECOND_LEVEL_LABELS.has(labels[labels.length - 1])) labels.pop();
  return labels[labels.length - 1];
}
