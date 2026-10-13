/**
 * The messages for starting a vendor research run, in one place so that every screen that
 * can start one (the findings section, the button on the vendors table) says the same thing.
 *
 * The start call is refused as a matter of course (the LLM key is missing, the cooldown has not
 * run out, the queue is down), and the global error toast is off for it, so a screen must say
 * something for every outcome. These functions turn the outcome into an alert with translated
 * text. They run in event handlers, outside any component, so they read the active language
 * the way customAxios does; `t` exists for tests.
 */

import { translateKey } from "../../i18n/domTranslator";
import { fill } from "../../i18n/fill";
import { readVendorResearchError } from "../repository/vendorResearch.repository";

/** The alert a screen hands to its page: the same shape as the Vendors page's own alert state. */
export interface ResearchAlert {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
}

type Translate = (key: string) => string;

/** A start that was accepted: a new run, or the run the vendor already has. */
export function alertForStarted(
  result: { alreadyRunning: boolean },
  vendorName: string,
  t: Translate = translateKey,
): ResearchAlert {
  if (result.alreadyRunning) {
    return {
      variant: "info",
      body: fill(t("Research is already running for {vendorName}."), { vendorName }),
    };
  }
  return {
    variant: "success",
    body: fill(t("Research started for {vendorName}. Findings appear on the Risks tab."), {
      vendorName,
    }),
  };
}

/**
 * A start that failed, for whatever reason. Only the cases the server answers on purpose get
 * their own message; every other failure (500, a network error, 403, anything unknown) gets
 * the generic one, so a click is never answered with silence.
 */
export function alertForStartFailure(error: unknown, t: Translate = translateKey): ResearchAlert {
  const { status, code, retryAfterSeconds } = readVendorResearchError(error);

  if (status === 429 && code === "cooldown") {
    // A wait that is missing or unreadable still reads as a minute, never "NaN" or "0".
    const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 0) / 60));
    return {
      variant: "warning",
      body: fill(t("Research ran recently. Try again in {minutes} min."), { minutes }),
    };
  }
  if (status === 429 && code === "daily_cap") {
    return {
      variant: "warning",
      body: t("The daily research limit for your organization was reached. Try again tomorrow."),
    };
  }
  // On a start, a 409 means the organization has no LLM key.
  if (status === 409) {
    return { variant: "warning", body: t("Vendor research is not set up.") };
  }
  // The queue is down. This answer carries no code, so the status tells it.
  if (status === 503) {
    return {
      variant: "error",
      body: t(
        "The research could not be started because the job queue is unavailable. Try again later.",
      ),
    };
  }
  return { variant: "error", body: t("The research could not be started. Try again.") };
}
