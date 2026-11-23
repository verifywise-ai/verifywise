/**
 * The status job of the vendor risk database (spec D5.7 cases 10 and 11, Q16, Ruling 12 of the M2
 * plan): `vrdb_relabel` on the queue of the syncs (queue.ts), added after a sync or a read-through
 * answer that changed the status of a record. It finds the pending findings with a label, one
 * organization at a time, that cite a record of the list whose status is no longer the one they
 * stored: an entry that left its list, a rejected CVE (on any list, Ruling 9), an entry back on
 * its list. Each label is decided again by the rule of the run (credibility.ts), from the sources
 * the finding's basis describes with the statuses of today, and each record shows its status from
 * the day it changed. A finding a person accepted or dismissed is never changed, one decided while
 * the job runs included, and nobody is notified (Q16).
 */
import type {
  CredibilitySource,
  FindingSource,
  StoredCredibilityBasis,
  VrdbSourceId,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import {
  findFindingsToRelabelQuery,
  updateFindingCredibilityQuery,
} from "../../../utils/vrdb.utils";
import { decideCredibility, isRuleBasis } from "../credibility";
import type { FindingRelabel, FindingToRelabel, RecordStatusChange } from "./types";

export type { FindingRelabel, FindingToRelabel, RecordStatusChange } from "./types";

/** How many times the job reads the findings, while a write finds its finding changed since. */
const MAX_PASSES = 3;

/** The queries of the job (utils/vrdb.utils.ts). */
export interface RelabelStore {
  findFindingsToRelabel(sourceId: VrdbSourceId): Promise<FindingToRelabel[]>;
  /**
   * Writes a finding's label again, in its organization, while it is pending and its basis is the
   * one the job read; false when it was not written.
   */
  updateFindingCredibility(
    organizationId: number,
    findingId: number,
    update: FindingRelabel & { previousBasis: StoredCredibilityBasis },
  ): Promise<boolean>;
}

/** The record of a described source with its status of today, dated the day it changed. */
function withStatus(source: CredibilitySource, change: RecordStatusChange): CredibilitySource {
  if (source.record === undefined) return source;
  const { source: list, match, source_record_id: sourceRecordId } = source.record;
  return {
    ...source,
    // The day of the copy and its staleness gave way to the day of the change.
    record: {
      source: list,
      match,
      status: change.status,
      ...(sourceRecordId === undefined ? {} : { source_record_id: sourceRecordId }),
      as_of: change.changedOn,
      ...(change.rejectedBy === undefined ? {} : { rejected_by: change.rejectedBy }),
    },
  };
}

/**
 * The label of a finding, its basis and its sources with the statuses the records it cites have
 * now; null when no cited record's status differs from the one the finding stored, or when its
 * basis holds no list of sources. A source changes where the basis describes it, as the run wrote
 * them (pipeline.ts): at the same place, for the same address. The basis keeps the version of the
 * registry that classified its sources, and a contradicted finding stays Low. Pure.
 */
export function relabelFinding(input: {
  basis: StoredCredibilityBasis;
  sources: FindingSource[];
  statuses: ReadonlyMap<number, RecordStatusChange>;
}): FindingRelabel | null {
  const { basis, sources, statuses } = input;
  // A label the backfill wrote is never decided again: its sources came from the per-run lookups,
  // with no record of the vendor risk database to follow (Ruling 8 of the M3 plan).
  if (!isRuleBasis(basis)) return null;
  if (!Array.isArray(basis.sources) || !Array.isArray(sources)) return null;
  const changes = sources.map((source): RecordStatusChange | undefined => {
    const recordId = source.record?.record_id;
    const change = typeof recordId === "number" ? statuses.get(recordId) : undefined;
    return change !== undefined && change.status !== source.record?.status ? change : undefined;
  });
  if (changes.every((change) => change === undefined)) return null;

  const described = basis.sources.map((source, index) => {
    const change = changes[index];
    return change === undefined || source.url !== sources[index]?.url
      ? source
      : withStatus(source, change);
  });
  const { label, rule, nameOnly } = decideCredibility(described, {
    contradicted: basis.rule === "contradicted",
  });
  return {
    label,
    basis: { ...basis, rule, name_only: nameOnly, sources: described },
    sources: sources.map((source, index) => {
      const change = changes[index];
      return change === undefined || source.record === undefined
        ? source
        : { ...source, record: { ...source.record, status: change.status } };
    }),
  };
}

/** The store of the job in the database. */
export const databaseRelabelStore: RelabelStore = {
  findFindingsToRelabel: (sourceId) => findFindingsToRelabelQuery(sourceId),
  updateFindingCredibility: (organizationId, findingId, update) =>
    updateFindingCredibilityQuery(organizationId, findingId, update),
};

/**
 * Relabels the findings that cite a record of the list whose status changed, each written in its
 * own organization. A write that finds its finding decided, or relabeled by another job since the
 * read, is not made, and the findings are read again, at most three times: a finding is never left
 * with what another job read before a change. Throws for what the store throws, so that BullMQ
 * tries the job again.
 */
export async function relabelSource(
  sourceId: VrdbSourceId,
  store: RelabelStore = databaseRelabelStore,
): Promise<{ relabeled: number }> {
  let relabeled = 0;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let skipped = 0;
    for (const finding of await store.findFindingsToRelabel(sourceId)) {
      const update = relabelFinding({
        basis: finding.credibility_basis,
        sources: finding.sources,
        statuses: finding.statuses,
      });
      if (update === null) continue;
      const written = await store.updateFindingCredibility(finding.organization_id, finding.id, {
        ...update,
        previousBasis: finding.credibility_basis,
      });
      if (written) relabeled += 1;
      else skipped += 1;
    }
    if (skipped === 0) break;
  }
  logger.info(
    `vendor risk database: findings relabeled by the status job of ${sourceId}: ${relabeled}`,
  );
  return { relabeled };
}
