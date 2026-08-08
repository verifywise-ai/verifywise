import { Transaction } from "sequelize";
import { createEUFrameworkQuery, deleteProjectFrameworkEUQuery } from "../utils/eu.utils";
import { createISOFrameworkQuery, deleteProjectFrameworkISOQuery } from "../utils/iso42001.utils";
import {
  createISO27001FrameworkQuery,
  deleteProjectFrameworkISO27001Query,
} from "../utils/iso27001.utils";
import {
  createNISTAI_RMFFrameworkQuery,
  deleteProjectFrameworkNISTQuery,
} from "../utils/nistAiRmfCorrect.utils";
import {
  createSOC2FrameworkQuery,
  deleteProjectFrameworkSOC2Query,
  createGDPRFrameworkQuery,
  deleteProjectFrameworkGDPRQuery,
  createPCIDSSFrameworkQuery,
  deleteProjectFrameworkPCIDSSQuery,
  createCCPAFrameworkQuery,
  deleteProjectFrameworkCCPAQuery,
  createDORAFrameworkQuery,
  deleteProjectFrameworkDORAQuery,
  createALTAIFrameworkQuery,
  deleteProjectFrameworkALTAIQuery,
  createFTCAIGuidelinesFrameworkQuery,
  deleteProjectFrameworkFTCAIGuidelinesQuery,
  createNYCLocalLaw144FrameworkQuery,
  deleteProjectFrameworkNYCLocalLaw144Query,
  createCISControlsFrameworkQuery,
  deleteProjectFrameworkCISControlsQuery,
  createAIEthicsFrameworkQuery,
  deleteProjectFrameworkAIEthicsQuery,
  createOECDAIPrinciplesFrameworkQuery,
  deleteProjectFrameworkOECDAIPrinciplesQuery,
  createDataGovernanceFrameworkQuery,
  deleteProjectFrameworkDataGovernanceQuery,
  createUAEPDPLFrameworkQuery,
  deleteProjectFrameworkUAEPDPLQuery,
  createSaudiPDPLFrameworkQuery,
  deleteProjectFrameworkSaudiPDPLQuery,
  createQatarPDPLFrameworkQuery,
  deleteProjectFrameworkQatarPDPLQuery,
  createBahrainPDPLFrameworkQuery,
  deleteProjectFrameworkBahrainPDPLQuery,
  createQuebecLaw25FrameworkQuery,
  deleteProjectFrameworkQuebecLaw25Query,
  createTexasAIActFrameworkQuery,
  deleteProjectFrameworkTexasAIActQuery,
  createColoradoAIActFrameworkQuery,
  deleteProjectFrameworkColoradoAIActQuery,
  createHIPAAFrameworkQuery,
  deleteProjectFrameworkHIPAAQuery,
  createNISTCSFFrameworkQuery,
  deleteProjectFrameworkNISTCSFQuery,
} from "../utils/frameworkRegistry.utils";

export const frameworkAdditionMap: Record<
  number,
  (
    projectId: number,
    enable_ai_data_insertion: boolean,
    organizationId: number,
    transaction: Transaction,
  ) => Promise<Object>
> = {
  1: createEUFrameworkQuery,
  2: createISOFrameworkQuery,
  3: createISO27001FrameworkQuery,
  4: createNISTAI_RMFFrameworkQuery,
  5: createSOC2FrameworkQuery,
  6: createGDPRFrameworkQuery,
  7: createPCIDSSFrameworkQuery,
  8: createCCPAFrameworkQuery,
  9: createDORAFrameworkQuery,
  10: createALTAIFrameworkQuery,
  11: createFTCAIGuidelinesFrameworkQuery,
  12: createNYCLocalLaw144FrameworkQuery,
  13: createCISControlsFrameworkQuery,
  14: createAIEthicsFrameworkQuery,
  15: createOECDAIPrinciplesFrameworkQuery,
  16: createDataGovernanceFrameworkQuery,
  17: createUAEPDPLFrameworkQuery,
  18: createSaudiPDPLFrameworkQuery,
  19: createQatarPDPLFrameworkQuery,
  20: createBahrainPDPLFrameworkQuery,
  21: createQuebecLaw25FrameworkQuery,
  22: createTexasAIActFrameworkQuery,
  23: createColoradoAIActFrameworkQuery,
  24: createHIPAAFrameworkQuery,
  25: createNISTCSFFrameworkQuery,
};

export const frameworkDeletionMap: Record<
  number,
  (id: number, organizationId: number, transaction: Transaction) => Promise<boolean>
> = {
  1: deleteProjectFrameworkEUQuery,
  2: deleteProjectFrameworkISOQuery,
  3: deleteProjectFrameworkISO27001Query,
  4: deleteProjectFrameworkNISTQuery,
  5: deleteProjectFrameworkSOC2Query,
  6: deleteProjectFrameworkGDPRQuery,
  7: deleteProjectFrameworkPCIDSSQuery,
  8: deleteProjectFrameworkCCPAQuery,
  9: deleteProjectFrameworkDORAQuery,
  10: deleteProjectFrameworkALTAIQuery,
  11: deleteProjectFrameworkFTCAIGuidelinesQuery,
  12: deleteProjectFrameworkNYCLocalLaw144Query,
  13: deleteProjectFrameworkCISControlsQuery,
  14: deleteProjectFrameworkAIEthicsQuery,
  15: deleteProjectFrameworkOECDAIPrinciplesQuery,
  16: deleteProjectFrameworkDataGovernanceQuery,
  17: deleteProjectFrameworkUAEPDPLQuery,
  18: deleteProjectFrameworkSaudiPDPLQuery,
  19: deleteProjectFrameworkQatarPDPLQuery,
  20: deleteProjectFrameworkBahrainPDPLQuery,
  21: deleteProjectFrameworkQuebecLaw25Query,
  22: deleteProjectFrameworkTexasAIActQuery,
  23: deleteProjectFrameworkColoradoAIActQuery,
  24: deleteProjectFrameworkHIPAAQuery,
  25: deleteProjectFrameworkNISTCSFQuery,
};

export const frameworkFilesDeletionSourceMap: Record<number, string[]> = {
  1: ["Assessment tracker group", "Compliance tracker group"],
  2: ["Management system clauses group", "Reference controls group"],
  3: ["Main clauses group", "Annex controls group"],
  4: ["Subcategories group"], // Only subcategories are tenant-based and have files
  // Frameworks 5-25 store file links in file_entity_links (not files.source),
  // so the source-based sweep in framework.utils.ts is a no-op. Their delete
  // functions handle file_entity_links cleanup themselves.
  5: [], 6: [], 7: [], 8: [], 9: [], 10: [], 11: [], 12: [], 13: [], 14: [],
  15: [], 16: [], 17: [], 18: [], 19: [], 20: [], 21: [], 22: [], 23: [], 24: [], 25: [],
};
