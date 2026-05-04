import riskData from "../../assets/IBMAIRISKDB.json";
import RiskDatabaseModal from "../RiskDatabaseModal";
import { RiskData, SelectedRiskData } from "../RiskDatabaseModal/types";
import { Likelihood, Severity } from "../RiskLevel/constants";

interface AddNewRiskIBMModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRiskSelected?: (riskData: SelectedRiskData) => void;
}

/**
 * Maps IBM severity strings to Severity enum.
 * IBM uses Minor/Moderate/Major severity scale.
 */
const mapSeverityIBM = (severity: string): Severity => {
  switch (severity.toLowerCase()) {
    case "minor":
      return Severity.Minor;
    case "moderate":
      return Severity.Moderate;
    case "major":
      return Severity.Major;
    default:
      return Severity.Moderate;
  }
};

/**
 * Maps IBM likelihood strings to Likelihood enum.
 * IBM uses Unlikely/Possible/Likely likelihood scale.
 */
const mapLikelihoodIBM = (likelihood: string): Likelihood => {
  switch (likelihood.toLowerCase()) {
    case "unlikely":
      return Likelihood.Unlikely;
    case "possible":
      return Likelihood.Possible;
    case "likely":
      return Likelihood.Likely;
    default:
      return Likelihood.Possible;
  }
};

/**
 * Modal for adding a new risk from the IBM AI Risk Database.
 * Uses the shared RiskDatabaseModal component with IBM-specific mappers.
 */
const AddNewRiskIBMModal = ({ isOpen, setIsOpen, onRiskSelected }: AddNewRiskIBMModalProps) => {
  return (
    <RiskDatabaseModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onRiskSelected={onRiskSelected}
      riskData={riskData as RiskData[]}
      mapSeverity={mapSeverityIBM}
      mapLikelihood={mapLikelihoodIBM}
      title="Add a new risk from IBM risk database"
      description="Search and select a risk from the IBM AI Risk Database"
      databaseName="IBM AI Risk Database"
    />
  );
};

export default AddNewRiskIBMModal;
