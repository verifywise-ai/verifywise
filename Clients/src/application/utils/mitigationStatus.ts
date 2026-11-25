/**
 * @fileoverview The mitigation status a risk shows.
 *
 * The mitigation status is optional, so many risks are saved without one. A
 * risk with none has not started mitigation: the server counts it as Not
 * Started (Home queue, advisor, history chart, reports), and the risk table's
 * cell, filter, sort and export read it through here so they agree.
 *
 * @module application/utils/mitigationStatus
 */

export const DEFAULT_MITIGATION_STATUS = "Not Started";

/** The stored status, or Not Started when the risk has none. */
export const getMitigationStatus = (risk: { mitigation_status?: string | null }): string =>
  risk.mitigation_status || DEFAULT_MITIGATION_STATUS;
