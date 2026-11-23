/**
 * The write of the vendor research settings: which of the organization's LLM keys the research
 * and the analysis use, and how often the scheduled scan researches a vendor again. The keys are
 * checked against the organization and the choice is stored in one transaction, and the check locks
 * the key rows until it ends, so that a key cannot be deleted between the check and the write that
 * names it. The scan interval is a number of days that the caller has checked, `null` for off, or
 * nothing to leave it as it is.
 */
import { sequelize } from "../../database/db";
import type {
  VendorResearchKeyChoice,
  VendorResearchSettings,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { llmKeyExistsQuery } from "../../utils/llmKey.utils";
import { saveVendorResearchSettingsQuery } from "../../utils/vendorResearch.utils";

export type SaveSettingsResult =
  { ok: true; settings: VendorResearchSettings } | { ok: false; reason: "unknown_key" };

export async function saveVendorResearchSettings(
  input: VendorResearchKeyChoice & {
    organizationId: number;
    userId: number;
    scanIntervalDays?: number | null;
  },
): Promise<SaveSettingsResult> {
  const { organizationId, userId, researchKeyId, analysisKeyId, scanIntervalDays } = input;

  return sequelize.transaction(async (transaction) => {
    const named = new Set([researchKeyId, analysisKeyId]);
    for (const id of named) {
      if (id !== null && !(await llmKeyExistsQuery(id, organizationId, transaction))) {
        return { ok: false, reason: "unknown_key" } as const;
      }
    }
    const settings = await saveVendorResearchSettingsQuery(
      { organizationId, userId, researchKeyId, analysisKeyId, scanIntervalDays },
      transaction,
    );
    return { ok: true, settings } as const;
  });
}
