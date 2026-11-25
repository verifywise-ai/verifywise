/**
 * How much a vendor matters to the company that relies on it, from three answers of the vendor's
 * own scorecard: the most sensitive data it holds, how much the company's work depends on it, and
 * the rules the company must meet because of it. The analysis reads them to judge how serious an
 * effect would be, so that one incident weighs more for a vendor that holds financial data and
 * cannot be replaced than for one that holds nothing.
 *
 * It is context for the analysis only. The research loop never sees it: the loop turns the vendor
 * into web searches, and what a company says about its own dependence is no business of the web.
 *
 * Each answer must be exactly one of the values the scorecard offers (the same lists the vendor
 * form is validated with), so what reaches the prompt is a closed vocabulary and never text that a
 * person typed. Anything else is left out. The other questions of the scorecard are not read: the
 * past issues are the company's belief about the past, and the research is meant to find that out.
 */
import { IVendor } from "../../domain.layer/interfaces/i.vendor";
import {
  VENDOR_BUSINESS_CRITICALITY_ENUM,
  VENDOR_DATA_SENSITIVITY_ENUM,
  VENDOR_REGULATORY_EXPOSURE_ENUM,
} from "../../utils/validations/vendorValidation.utils";

export interface Materiality {
  /** The most sensitive data the company shares with the vendor. */
  dataSensitivity: string | null;
  /** How much the company's work depends on the vendor. */
  businessCriticality: string | null;
  /** The rules the company must meet because of the vendor. */
  regulatoryExposure: string | null;
}

/** The value when it is one of `allowed` and nothing else, so no free text gets through. */
function onList(allowed: readonly string[], value: unknown): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

/**
 * The materiality of a vendor, or null when it has not answered any of the three questions with a
 * value of the scorecard. "None" is an answer: a vendor that holds no data weighs less.
 */
export function buildMateriality(
  vendor: Pick<IVendor, "data_sensitivity" | "business_criticality" | "regulatory_exposure">,
): Materiality | null {
  const materiality: Materiality = {
    dataSensitivity: onList(VENDOR_DATA_SENSITIVITY_ENUM, vendor.data_sensitivity),
    businessCriticality: onList(VENDOR_BUSINESS_CRITICALITY_ENUM, vendor.business_criticality),
    regulatoryExposure: onList(VENDOR_REGULATORY_EXPOSURE_ENUM, vendor.regulatory_exposure),
  };
  return Object.values(materiality).every((answer) => answer === null) ? null : materiality;
}
