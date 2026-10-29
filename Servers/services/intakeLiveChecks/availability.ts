// Servers/services/intakeLiveChecks/availability.ts
// Whether a form's public page may make AI calls (AI checks and prefill).
import type { IIntakeForm } from "../../domain.layer/interfaces/i.intakeForm";
import { llmKeyExistsQuery } from "../../utils/llmKey.utils";

/** True when live checks are on and the form's LLM key still exists in the organisation. */
export async function formAiAvailable(
  form: Pick<IIntakeForm, "liveChecksEnabled" | "llmKeyId">,
  organizationId: number,
): Promise<boolean> {
  if (!form.liveChecksEnabled || form.llmKeyId == null) return false;
  return llmKeyExistsQuery(form.llmKeyId, organizationId);
}
