import { readFileSync } from "fs";
import { join } from "path";
import { FRAMEWORK_STRUCTURES } from "..";
import { frameworkTextFingerprint, textRevisionOf } from "../../services/frameworkTextSync/plan";

/**
 * Item text reaches existing databases through services/frameworkTextSync,
 * which only writes a framework's text when the build's textRevision is at
 * least the one the database records. A text change shipped without a bump
 * would never reach a database that already holds that revision, and an older
 * build could write the old wording back. This pins every framework's text to
 * its revision.
 */
const recorded: Record<string, { revision: number; fingerprint: string }> = JSON.parse(
  readFileSync(join(__dirname, "..", "frameworkTextRevisions.json"), "utf8"),
);

describe("bundled framework text revisions", () => {
  it.each(FRAMEWORK_STRUCTURES.map((fw) => [fw.key, fw] as const))(
    "%s: text matches its recorded revision",
    (key, fw) => {
      const revision = textRevisionOf(fw);
      const fingerprint = frameworkTextFingerprint(fw.seed);
      const entry = recorded[key];
      if (!entry) {
        throw new Error(`${key} has no recorded text revision: run npm run framework-text:record`);
      }
      if (fingerprint !== entry.fingerprint && revision <= entry.revision) {
        throw new Error(
          `${key}: the item text changed, so bump textRevision to ${entry.revision + 1} in its .structure.ts, then run npm run framework-text:record`,
        );
      }
      if (fingerprint !== entry.fingerprint || revision !== entry.revision) {
        throw new Error(`${key}: run npm run framework-text:record to record revision ${revision}`);
      }
    },
  );

  it("records no framework that is not in the registry", () => {
    const keys = new Set(FRAMEWORK_STRUCTURES.map((fw) => fw.key));
    expect(Object.keys(recorded).filter((k) => !keys.has(k))).toEqual([]);
  });
});
