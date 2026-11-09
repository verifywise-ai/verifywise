import type { AedtProfileView } from "../../../application/repository/aedtBiasAudit.repository";
import type { BiasAuditSection } from "./sections";

export interface NextStep {
  section: BiasAuditSection;
  text: string;
  action: string;
}

/** The one thing to do next, from the profile and the runs recorded so far. */
export function nextStepFor(profile: AedtProfileView, runsCount: number): NextStep {
  const current = profile.profile;
  const decision = profile.attestedDecision;
  if (!current) {
    return { section: "profile", text: "Answer the profile questions.", action: "Open profile" };
  }
  if (!decision) {
    return profile.readiness.missingVetoes.length > 0
      ? {
          section: "profile",
          text: "Answer the required questions, then attest the profile.",
          action: "Open profile",
        }
      : {
          section: "profile",
          text: "Attest the profile. An Admin confirms the answers as your position.",
          action: "Open profile",
        };
  }
  // A newer draft is what the user is working on; runs keep using the attested version.
  if (current.status === "draft" && current.id !== profile.attested?.id) {
    return {
      section: "profile",
      text: "Finish and attest your latest answers so new runs use them.",
      action: "Open profile",
    };
  }
  if (decision.readiness.scope === "out_of_scope") {
    return {
      section: "scope",
      text: "The tool is out of scope on your answers. Record a scope determination.",
      action: "Open scope determination",
    };
  }
  // Without a cutoff answer no rate can be calculated, so runs are closed too.
  if (decision.metric === null) {
    return {
      section: "profile",
      text: "Answer who applies the cutoff, then attest again.",
      action: "Open profile",
    };
  }
  if (runsCount === 0) {
    return decision.mayGenerate
      ? {
          section: "generate",
          text: "Generate test candidates, score them in your platform, then upload the scores as a run.",
          action: "Generate test candidates",
        }
      : {
          section: "runs",
          text: "Upload scored results from your platform as your first run.",
          action: "Open runs",
        };
  }
  return {
    section: "runs",
    text: "Record a run for this month to keep your results current.",
    action: "Open runs",
  };
}
