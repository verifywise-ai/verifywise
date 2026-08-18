import type { FrameworkStructure } from "./types";

import soc2Structure from "./SOC2/soc2.structure";
import gdprStructure from "./GDPR/gdpr.structure";
import pciDssStructure from "./PCI-DSS/pci-dss.structure";
import ccpaStructure from "./CCPA/ccpa.structure";
import doraStructure from "./DORA/dora.structure";
import altaiStructure from "./ALTAI/altai.structure";
import ftcAiGuidelinesStructure from "./FTC-AI-Guidelines/ftc-ai-guidelines.structure";
import nycLocalLaw144Structure from "./NYC-Local-Law-144/nyc-local-law-144.structure";
import cisControlsStructure from "./CIS-Controls/cis-controls.structure";
import aiEthicsStructure from "./AI-Ethics/ai-ethics.structure";
import oecdAiPrinciplesStructure from "./OECD-AI-Principles/oecd-ai-principles.structure";
import dataGovernanceStructure from "./Data-Governance/data-governance.structure";
import uaePdplStructure from "./UAE-PDPL/uae-pdpl.structure";
import saudiPdplStructure from "./Saudi-PDPL/saudi-pdpl.structure";
import qatarPdplStructure from "./Qatar-PDPL/qatar-pdpl.structure";
import bahrainPdplStructure from "./Bahrain-PDPL/bahrain-pdpl.structure";
import quebecLaw25Structure from "./Quebec-Law25/quebec-law25.structure";
import texasAiActStructure from "./Texas-AI-Act/texas-ai-act.structure";
import coloradoAiActStructure from "./Colorado-AI-Act/colorado-ai-act.structure";
import hipaaStructure from "./HIPAA/hipaa.structure";
import nistCsfStructure from "./NIST-CSF/nist-csf.structure";

export * from "./types";

/**
 * Registry of the 21 migrated frameworks. Built-ins (EU AI Act, ISO 42001,
 * ISO 27001, NIST AI RMF) are not in this list — they keep their bespoke
 * struct/impl tables and endpoints.
 */
export const FRAMEWORK_STRUCTURES: FrameworkStructure[] = [
  soc2Structure,
  gdprStructure,
  pciDssStructure,
  ccpaStructure,
  doraStructure,
  altaiStructure,
  ftcAiGuidelinesStructure,
  nycLocalLaw144Structure,
  cisControlsStructure,
  aiEthicsStructure,
  oecdAiPrinciplesStructure,
  dataGovernanceStructure,
  uaePdplStructure,
  saudiPdplStructure,
  qatarPdplStructure,
  bahrainPdplStructure,
  quebecLaw25Structure,
  texasAiActStructure,
  coloradoAiActStructure,
  hipaaStructure,
  nistCsfStructure,
];

const BY_KEY = new Map<string, FrameworkStructure>();
const BY_ID = new Map<number, FrameworkStructure>();
for (const fw of FRAMEWORK_STRUCTURES) {
  BY_KEY.set(fw.key, fw);
  BY_ID.set(fw.id, fw);
}

export function getStructureByKey(key: string): FrameworkStructure | null {
  return BY_KEY.get(key) || null;
}

export function getStructureById(id: number): FrameworkStructure | null {
  return BY_ID.get(id) || null;
}

/**
 * Throwing variant used by migrations that require the entry to exist.
 */
export function requireStructureByKey(key: string): FrameworkStructure {
  const cfg = BY_KEY.get(key);
  if (!cfg) throw new Error(`No FrameworkStructure registered for key '${key}'`);
  return cfg;
}
