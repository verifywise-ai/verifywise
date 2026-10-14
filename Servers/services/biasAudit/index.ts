import { computeBiasAudit } from "./engine";
import type { AuditRecord, BiasAuditConfig, BiasAuditResult } from "./engine/types";
import { countUnknown, runDataGates, type GateFinding, type GateResult } from "./dataGates";
import { checkIdOrder, type OrderFinding } from "./idOrderCheck";

export interface AuditOutcome {
  gates: GateResult;
  order: OrderFinding[];
  result: BiasAuditResult | null;
}

/** A clustered attribute, stated as a warning that withholds the PDF. */
function orderFinding(o: OrderFinding): GateFinding {
  return {
    code: "attribute_order_clustered",
    severity: "warn",
    message:
      `Values of "${o.attribute}" are clustered in the input order: ` +
      `${o.observedRuns} runs observed against about ${Math.round(o.expectedRuns)} ` +
      `expected under random ordering. Figures from clustered input may reflect ` +
      `how the data was assembled rather than the tool being tested.`,
    detail: {
      attribute: o.attribute,
      observedRuns: o.observedRuns,
      expectedRuns: o.expectedRuns,
      ratio: o.ratio,
    },
  };
}

/**
 * Gate first, then compute.
 *
 * `result` is null when a hard stop fired: the arithmetic is not attempted,
 * so there is no figure for a caller to surface by accident.
 *
 * Ordering findings travel beside the result rather than suppressing it.
 * Blocked ordering says the figures may not be attributable to the tool under
 * audit, which is a provenance question for whoever reports them; it is not a
 * reason to withhold the arithmetic from the person who must judge it. It
 * does withhold the PDF, as a warning: an exported document outlives the
 * screen that explains the caveat.
 *
 * `protectedAttributes` defaults to every configured category, so no category
 * reaches the ratios without also being order-checked.
 */
export function runAudit(
  records: AuditRecord[],
  config: BiasAuditConfig,
  protectedAttributes: string[] = Object.keys(config.categories),
): AuditOutcome {
  const dataGates = runDataGates(records, config);
  const order = checkIdOrder(records, protectedAttributes);
  const orderFindings = order.filter((o) => o.blocked).map(orderFinding);

  const gates: GateResult = {
    findings: [...dataGates.findings, ...orderFindings],
    mayComputeRatios: dataGates.mayComputeRatios,
    mayExportPdf: dataGates.mayExportPdf && orderFindings.length === 0,
  };

  // § 5-301(c) requires the count assessed but in an unknown category.
  const unknown = countUnknown(records, config).unknownRecords;
  const result = gates.mayComputeRatios ? computeBiasAudit(records, config, unknown) : null;
  return { gates, order, result };
}

export { computeBiasAudit, RECORD_KEYS } from "./engine";
export { countUnknown, runDataGates } from "./dataGates";
export { checkIdOrder, countRuns, expectedRuns } from "./idOrderCheck";
export type { AuditRecord, BiasAuditConfig, BiasAuditResult } from "./engine/types";
export type { GateFinding, GateResult, GateSeverity, UnknownCounts } from "./dataGates";
export type { OrderFinding } from "./idOrderCheck";
