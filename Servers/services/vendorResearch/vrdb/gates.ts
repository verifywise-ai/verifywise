/**
 * The gates of the vendor risk database (spec D8, M2): a list that waits for a person is defined
 * and tested, but while its gate is closed it is never downloaded, scheduled or looked up, and no
 * run shows it. A gate opens by a change of this file, once a person has done what it waits for:
 *
 * - Q4, the SEC: the e-mail address of a role, not of a person, for the User-Agent the SEC asks of
 *   automated access. While it is closed a run asks the SEC itself, by the CIK stored on the vendor
 *   or by its name (records/index.ts); once it is open the database reads the SEC through
 *   (connectors/sec.ts), every request naming that address.
 * - Q6, the UN list: a person has read the UN's terms of use and copyright pages (they refused
 *   automated readers) and checked the element names of the connector against the real XML.
 * - Q7, the CVE records: a legal review of the CVE Terms of Use for this use, and the permission to
 *   download the baseline file.
 */

export type VrdbGate = "Q4" | "Q6" | "Q7";

/** The address of a role that the SEC's User-Agent names (Q4); null until a person gives one. */
export const SEC_CONTACT: string | null = null;

/** True once a person has read the UN's terms and checked the XML's element names (Q6). */
export const UN_TERMS_READ = false;

/** True once the CVE Terms of Use are approved for this use and the baseline may be fetched (Q7). */
export const CVE_TERMS_APPROVED = false;

/** Which gates are open. */
export const VRDB_GATES: Readonly<Record<VrdbGate, boolean>> = {
  Q4: SEC_CONTACT !== null,
  Q6: UN_TERMS_READ,
  Q7: CVE_TERMS_APPROVED,
};
