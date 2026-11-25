/**
 * What a record of a list that attests (`attests` in sources.ts) says in the vendor's favour, in the
 * closed words of the coverage (`CoverageAttestation`): read back from the text the list's own
 * connector wrote, so that the screen can name a FedRAMP authorisation or a C2PA conformance under
 * Certifications without reading text of the web. A list that attests and has no reader here gives
 * a row with no status, which says that the vendor is listed and nothing more.
 */
import type {
  CoverageAttestation,
  VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { c2paAttestationOf } from "./connectors/c2paConforming";
import { fedrampAttestationOf } from "./connectors/fedramp";
import type { OfferedRecord, VrdbRow } from "./types";

type Reader = (
  summary: string,
) => Pick<CoverageAttestation, "status" | "impact" | "since" | "count">;

/** The reader of each list that attests. */
export const ATTESTATION_READERS: Partial<Record<VrdbSourceId, Reader>> = {
  fedramp: fedrampAttestationOf,
  c2pa_conforming: c2paAttestationOf,
};

/** The attestation of one offered record of a list that attests. */
export function attestationOf(
  sourceId: VrdbSourceId,
  row: Pick<VrdbRow, "summary">,
  offered: Pick<OfferedRecord["vrdb"], "strength" | "asOf">,
): CoverageAttestation {
  const read = ATTESTATION_READERS[sourceId]?.(row.summary) ?? {
    status: null,
    impact: null,
    since: null,
    count: 0,
  };
  return { ...read, strength: offered.strength, as_of: offered.asOf };
}
