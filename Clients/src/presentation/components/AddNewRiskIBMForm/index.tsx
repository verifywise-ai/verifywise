import riskData from "../../assets/IBMAIRISKDB.json";
import RiskDatabaseModal from "../RiskDatabaseModal";
import { RiskData, SelectedRiskData } from "../RiskDatabaseModal/types";
import { mapSeverityIBM, mapLikelihoodIBM } from "../AddNewRiskForm/riskSuggestionMappers";

interface AddNewRiskIBMModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRiskSelected?: (riskData: SelectedRiskData) => void;
}

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
