/**
 * The CISA catalog of known exploited vulnerabilities (KEV): one public JSON file, keyless, that
 * lists the vulnerabilities which CISA has evidence of being exploited in the wild. An entry names
 * the vendor or project by one string (`vendorProject`), and it is the vendor's only when that
 * string is a name of the vendor (see match.ts). The catalog is a work of the United States
 * government and free to use.
 *
 * The vendor risk database mirrors the catalog (vrdb/connectors/kev.ts) and a run looks the vendor
 * up there. The run no longer reads the file itself (M3 Part B), so this path keeps only the names
 * that other code imports from it.
 */
import { KEV_MAX_BYTES, KEV_URL, type KevEntry, cvePageOf, parseKev } from "../vrdb/connectors/kev";

// The parser and the address of the catalog moved to the mirror's connector; this path keeps them.
export { KEV_MAX_BYTES, KEV_URL, type KevEntry, cvePageOf, parseKev };
