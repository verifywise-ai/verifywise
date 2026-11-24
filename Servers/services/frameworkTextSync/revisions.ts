/**
 * Every framework the text sync writes, with its text revision and a
 * fingerprint of the text: the 24 bundled frameworks and the 4 built-ins,
 * each including its `frameworks` description. Used by
 * scripts/recordFrameworkTextRevisions.ts and
 * structures/__tests__/frameworkTextRevisions.test.ts, which keep a text
 * change from shipping without a revision bump. Pure: no database.
 */
import { createHash } from "crypto";
import { FRAMEWORK_STRUCTURES } from "../../structures";
import { frameworkTextFingerprint, textRevisionOf } from "./plan";
import { keyedTextFingerprint } from "./keyed";
import { BUILTIN_TEXT_SOURCES, descriptionTarget } from "./builtins";

export interface TextRevisionEntry {
  key: string;
  revision: number;
  fingerprint: string;
  /** Where to bump the revision. */
  where: string;
}

export function textRevisionEntries(): TextRevisionEntry[] {
  const builtins = BUILTIN_TEXT_SOURCES.map((b) => ({
    key: b.key,
    revision: b.textRevision,
    fingerprint: keyedTextFingerprint([...b.targets(), descriptionTarget(b.id, b.description)]),
    where: "its entry in services/frameworkTextSync/builtins.ts",
  }));
  const bundled = FRAMEWORK_STRUCTURES.map((fw) => ({
    key: fw.key,
    revision: textRevisionOf(fw),
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify([
          frameworkTextFingerprint(fw.seed),
          keyedTextFingerprint([descriptionTarget(fw.id, fw.seed.description ?? null)]),
        ]),
      )
      .digest("hex"),
    where: "its .structure.ts",
  }));
  return [...builtins, ...bundled];
}
