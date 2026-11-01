/**
 * The gates of the vendor risk database (spec D8, M2): a list that waits for a person is defined
 * and tested, but while its gate is closed it is never downloaded, scheduled or looked up, and no
 * run shows it. A gate opens by a change of this file, once a person has done what it waits for:
 *
 * - Q4, the SEC: open since 2026-10-31. The SEC asks automated access for a User-Agent that names
 *   the e-mail address of whoever runs the client, so that it can write before it limits or blocks
 *   the client. Q4 was answered on 2026-10-31, on the product owner's approval of the recommended
 *   answers, with the address of a role and not of a person: the Technical Support contact that
 *   verifywise.ai/contact publishes. With the gate open the database reads the SEC through
 *   (connectors/sec.ts), every request naming that address in the SEC's own form,
 *   `VerifyWise tech@verifywise.ai`, and the SEC leaves the lookups a run makes beside the
 *   database (records/index.ts `sourcesBesideVrdb`).
 * - Q6, the UN list: the written permission of the United Nations to copy its list into this
 *   database and show its entries in the product. Its terms of use, read on 2026-10-31, allow
 *   personal, non-commercial use only, without the right to redistribute, compile or create
 *   derivative works, and UN Publications asks for written permission to reuse content from a UN
 *   database (permissions@un.org). The connector was checked against the real file the same day.
 *   Until then the UN's designations reach a run through the UK and EU lists, which carry them
 *   (spec D2.5).
 * - Q7, the CVE records: open since 2026-10-31. The CVE Terms of Use for this use were accepted by
 *   the product owner on 2026-10-31, without a separate legal review, and the product owner
 *   permitted the download of the baseline file. The Terms let anyone copy the records on one
 *   condition, that every copy reproduces MITRE's copyright designation and the licence, which the
 *   cve row of vrdb_sources holds (sources.ts). The first copy is a baseline that an operator loads
 *   once, with scripts/vrdbCveBaseline.ts; the daily sync reads the changes from it on.
 */

export type VrdbGate = "Q4" | "Q6" | "Q7";

/**
 * The address of a role that the SEC's User-Agent names (Q4): the Technical Support contact of
 * verifywise.ai/contact, answered on 2026-10-31. A constant and not a setting, so that every
 * deployment declares the same identity. The gate of Q4 is open while it is not null.
 */
export const SEC_CONTACT: string | null = "tech@verifywise.ai";

/**
 * True once the United Nations has given written permission to copy its list into this database
 * and show its entries in the product (Q6); its terms of use allow personal, non-commercial use
 * only.
 */
export const UN_PERMISSION_GRANTED = false;

/**
 * True once the CVE Terms of Use are approved for this use and the baseline may be fetched (Q7).
 * The product owner accepted the Terms for this use on 2026-10-31, with no separate legal review,
 * and permitted the baseline download.
 */
export const CVE_TERMS_APPROVED = true;

/** Which gates are open. */
export const VRDB_GATES: Readonly<Record<VrdbGate, boolean>> = {
  Q4: SEC_CONTACT !== null,
  Q6: UN_PERMISSION_GRANTED,
  Q7: CVE_TERMS_APPROVED,
};
