import ibmRiskData from "../../assets/IBMAIRISKDB.json";
import { RiskData, SeverityMapper, LikelihoodMapper } from "../RiskDatabaseModal/types";
import {
  mapSeverityIBM,
  mapLikelihoodIBM,
  mapSeverityMIT,
  mapLikelihoodMIT,
} from "../AddNewRiskForm/riskSuggestionMappers";

export type RiskCatalogSource = "ibm" | "mit";

export interface RiskCatalogConfig {
  title: string;
  description: string;
  databaseName: string;
  mapSeverity: SeverityMapper;
  mapLikelihood: LikelihoodMapper;
  loadData: () => RiskData[] | Promise<RiskData[]>;
}

export const riskCatalogs: Record<RiskCatalogSource, RiskCatalogConfig> = {
  ibm: {
    title: "Add a new risk from IBM risk database",
    description: "Search and select a risk from the IBM AI Risk Database",
    databaseName: "IBM AI Risk Database",
    mapSeverity: mapSeverityIBM,
    mapLikelihood: mapLikelihoodIBM,
    loadData: () => ibmRiskData as RiskData[],
  },
  mit: {
    title: "Add a new risk from risk database",
    description: "Search and select a risk from the MIT AI Risk Database",
    databaseName: "MIT AI Risk Database",
    mapSeverity: mapSeverityMIT,
    mapLikelihood: mapLikelihoodMIT,
    loadData: () => fetch("/data/MITAIRISKDB.json").then((res) => res.json()),
  },
};
