/**
 * Records each bundled framework's text revision and fingerprint in
 * structures/frameworkTextRevisions.json, which
 * structures/__tests__/frameworkTextRevisions.test.ts checks.
 *
 * Run after changing a framework's item text AND bumping its textRevision:
 *   npm run framework-text:record
 *
 * It refuses to record changed text under the same revision, because a
 * database that already holds that revision would then never get the new
 * wording, and an older build could write the old wording back.
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { textRevisionEntries } from "../services/frameworkTextSync/revisions";

export const RECORD_PATH = join(__dirname, "..", "structures", "frameworkTextRevisions.json");

type Recorded = Record<string, { revision: number; fingerprint: string }>;

function main() {
  const previous: Recorded = existsSync(RECORD_PATH)
    ? JSON.parse(readFileSync(RECORD_PATH, "utf8"))
    : {};
  const next: Recorded = {};
  const problems: string[] = [];
  for (const { key, revision, fingerprint, where } of textRevisionEntries()) {
    const before = previous[key];
    if (before && revision < before.revision) {
      problems.push(
        `${key}: the text revision went down from ${before.revision} to ${revision}; databases that hold ${before.revision} would stop syncing. Set it back to at least ${before.revision} in ${where}`,
      );
    } else if (before && before.fingerprint !== fingerprint && revision <= before.revision) {
      problems.push(
        `${key}: the text changed but the text revision is still ${revision}; set it to ${before.revision + 1} in ${where}`,
      );
    }
    next[key] = { revision, fingerprint };
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  writeFileSync(RECORD_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(next).length} frameworks in ${RECORD_PATH}`);
}

if (require.main === module) main();
