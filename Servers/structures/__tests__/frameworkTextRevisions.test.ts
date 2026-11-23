import { readFileSync } from "fs";
import { join } from "path";
import { textRevisionEntries } from "../../services/frameworkTextSync/revisions";

/**
 * Item text and descriptions reach existing databases through
 * services/frameworkTextSync, which only writes a framework's text when the
 * build's text revision is at least the one the database records. A text
 * change shipped without a bump would never reach a database that already
 * holds that revision, and an older build could write the old wording back.
 * This pins every framework's text (bundled and built-in) to its revision.
 */
const recorded: Record<string, { revision: number; fingerprint: string }> = JSON.parse(
  readFileSync(join(__dirname, "..", "frameworkTextRevisions.json"), "utf8"),
);
const entries = textRevisionEntries();

describe("framework text revisions", () => {
  it.each(entries.map((e) => [e.key, e] as const))(
    "%s: text matches its recorded revision",
    (key, { revision, fingerprint, where }) => {
      const entry = recorded[key];
      if (!entry) {
        throw new Error(`${key} has no recorded text revision: run npm run framework-text:record`);
      }
      if (fingerprint !== entry.fingerprint && revision <= entry.revision) {
        throw new Error(
          `${key}: the text changed, so bump its text revision to ${entry.revision + 1} in ${where}, then run npm run framework-text:record`,
        );
      }
      if (fingerprint !== entry.fingerprint || revision !== entry.revision) {
        throw new Error(`${key}: run npm run framework-text:record to record revision ${revision}`);
      }
    },
  );

  it("records no framework the sync does not know", () => {
    const keys = new Set(entries.map((e) => e.key));
    expect(Object.keys(recorded).filter((k) => !keys.has(k))).toEqual([]);
  });
});
