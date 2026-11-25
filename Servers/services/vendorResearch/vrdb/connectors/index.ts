/**
 * The connector of each list the vendor risk database mirrors, and the fetch they download with.
 * Only the bundler (scripts/vrdbBundle.ts) downloads: the server loads the bundles a release ships
 * and never runs a connector's download (../bundle.ts).
 */
import type { VrdbSourceId } from "../../../../domain.layer/interfaces/i.vendorResearch";
import { guardedConditionalFetch } from "../../../webResearch/guardedFetch";
import { aiidConnector } from "./aiid";
import { atlasConnector } from "./atlas";
import { c2paConformingConnector } from "./c2paConforming";
import { californiaBreachesConnector } from "./californiaBreaches";
import { canadaAiRegisterConnector } from "./canadaAiRegister";
import { canadaSemaConnector } from "./canadaSema";
import { charlotinConnector } from "./charlotin";
import { coSicPenaltiesConnector } from "./coSicPenalties";
import { cslConnector } from "./csl";
import { cveConnector } from "./cve";
import { discloseIoConnector } from "./discloseIo";
import { epochAiConnector } from "./epochAi";
import { euConnector } from "./eu";
import { euDgCompConnector } from "./euDgComp";
import { fdaConnector } from "./fda";
import { fdaRecallsConnector } from "./fdaRecalls";
import { fedrampConnector } from "./fedramp";
import { fmtiConnector } from "./fmti";
import { ftcCompetitionConnector } from "./ftcCompetition";
import { ftcPenaltiesConnector } from "./ftcPenalties";
import { kevConnector } from "./kev";
import { nhtsaConnector } from "./nhtsa";
import { nhtsaOdiConnector } from "./nhtsaOdi";
import { nhtsaRecallsConnector } from "./nhtsaRecalls";
import { nlAlgoritmeregisterConnector } from "./nlAlgoritmeregister";
import { ofacConnector } from "./ofac";
import { ombAiInventoryConnector } from "./ombAiInventory";
import { piperollConnector } from "./piperoll";
import type { Connector, ConnectorFetch, IncrementalConnector } from "./types";
import { ukConnector } from "./uk";
import { ukAtrsConnector } from "./ukAtrs";
import { ukCmaConnector } from "./ukCma";
import { ukMhraConnector } from "./ukMhra";
import { ukOfsiConnector } from "./ukOfsi";
import { unConnector } from "./un";

export const CONNECTORS: Partial<Record<VrdbSourceId, Connector | IncrementalConnector>> = {
  kev: kevConnector,
  ofac: ofacConnector,
  uk_sanctions: ukConnector,
  eu_fsf: euConnector,
  cve: cveConnector,
  un_sanctions: unConnector,
  csl: cslConnector,
  aiid: aiidConnector,
  atlas: atlasConnector,
  nhtsa_sgo: nhtsaConnector,
  fda_ai_devices: fdaConnector,
  fda_device_recalls: fdaRecallsConnector,
  canada_sema: canadaSemaConnector,
  california_breaches: californiaBreachesConnector,
  uk_ofsi: ukOfsiConnector,
  charlotin: charlotinConnector,
  ftc_penalties: ftcPenaltiesConnector,
  piperoll: piperollConnector,
  eu_dg_comp: euDgCompConnector,
  disclose_io: discloseIoConnector,
  uk_cma: ukCmaConnector,
  canada_ai_register: canadaAiRegisterConnector,
  ftc_competition: ftcCompetitionConnector,
  omb_ai_inventory: ombAiInventoryConnector,
  co_sic_penalties: coSicPenaltiesConnector,
  uk_atrs: ukAtrsConnector,
  nhtsa_recalls: nhtsaRecallsConnector,
  fmti: fmtiConnector,
  uk_mhra: ukMhraConnector,
  nl_algoritmeregister: nlAlgoritmeregisterConnector,
  nhtsa_odi: nhtsaOdiConnector,
  fedramp: fedrampConnector,
  epoch_ai: epochAiConnector,
  c2pa_conforming: c2paConformingConnector,
};

/**
 * A list's file through the page guard: its address policy, its size cap and content types, the
 * bot's user agent, and the validators of the copy. The lists are files their operators publish
 * for download, read without robots.txt as the per-run lookups of records/ read them.
 */
export const connectorFetch: ConnectorFetch = (url, validators, limits) =>
  guardedConditionalFetch(url, validators, {
    maxBytes: limits.maxBytes,
    allowedContentTypes: limits.allowedContentTypes,
    totalTimeoutMs: limits.totalTimeoutMs,
  });
