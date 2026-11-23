/**
 * Which of an organization's LLM keys a research run uses. An administrator can choose one key for
 * the research loop (many small calls, where speed and cost count) and, if they like, another for
 * the analysis (one large call, where judgment counts). With nothing chosen, both use the newest
 * key, which is what the research did before the choice existed.
 *
 * A chosen key that is gone (the foreign key empties the choice when a key is deleted, but a stale
 * read can still name one) is treated as not chosen, so a run never fails for a setting.
 */
import type { VendorResearchKeyChoice } from "../../domain.layer/interfaces/i.vendorResearch";

/** The choice an administrator made: the key of the research loop and the key of the analysis. */
export type KeyChoice = VendorResearchKeyChoice;

export interface SelectedKeys<K> {
  research: K;
  /** The key of the analysis when it is not the key of the research; null when one model does both. */
  analysis: K | null;
}

/**
 * The keys for a run, or null when the organization has none. `keys` come newest first, the order
 * of the organization's key list.
 */
export function selectKeys<K extends { id?: number }>(
  keys: readonly K[],
  choice: KeyChoice,
): SelectedKeys<K> | null {
  const newest = keys[0];
  if (newest === undefined) return null;

  const named = (id: number | null): K | undefined =>
    id === null ? undefined : keys.find((key) => key.id === id);

  const research = named(choice.researchKeyId) ?? newest;
  const analysis = named(choice.analysisKeyId) ?? research;
  return { research, analysis: analysis === research ? null : analysis };
}
