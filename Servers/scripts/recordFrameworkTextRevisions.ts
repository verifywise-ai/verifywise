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
import { FRAMEWORK_STRUCTURES } from "../structures";
import { frameworkTextFingerprint, textRevisionOf } from "../services/frameworkTextSync/plan";

export const RECORD_PATH = join(__dirname, "..", "structures", "frameworkTextRevisions.json");

type Recorded = Record<string, { revision: number; fingerprint: string }>;

function main() {
  const previous: Recorded = existsSync(RECORD_PATH)
    ? JSON.parse(readFileSync(RECORD_PATH, "utf8"))
    : {};
  const next: Recorded = {};
  const problems: string[] = [];
  for (const fw of FRAMEWORK_STRUCTURES) {
    const revision = textRevisionOf(fw);
    const fingerprint = frameworkTextFingerprint(fw.seed);
    const before = previous[fw.key];
    if (before && before.fingerprint !== fingerprint && revision <= before.revision) {
      problems.push(
        `${fw.key}: the text changed but textRevision is still ${revision}; set it to ${before.revision + 1} in its .structure.ts`,
      );
    }
    next[fw.key] = { revision, fingerprint };
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  writeFileSync(RECORD_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Recorded ${Object.keys(next).length} frameworks in ${RECORD_PATH}`);
}

if (require.main === module) main();
