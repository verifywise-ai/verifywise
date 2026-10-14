import { useState, useEffect } from "react";
import RiskDatabaseModal from "../RiskDatabaseModal";
import { RiskData, SelectedRiskData } from "../RiskDatabaseModal/types";
import { mapSeverityMIT, mapLikelihoodMIT } from "../AddNewRiskForm/riskSuggestionMappers";

interface AddNewRiskMITModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRiskSelected?: (riskData: SelectedRiskData) => void;
}

/**
 * Modal for adding a new risk from the MIT AI Risk Database.
 * Uses the shared RiskDatabaseModal component with MIT-specific mappers.
 */
const AddNewRiskMITModal = ({ isOpen, setIsOpen, onRiskSelected }: AddNewRiskMITModalProps) => {
  const [riskData, setRiskData] = useState<RiskData[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isOpen || loaded) return;
    fetch("/data/MITAIRISKDB.json")
      .then((res) => res.json())
      .then((data) => {
        setRiskData(data);
        setLoaded(true);
      })
      .catch(() => {});
  }, [isOpen, loaded]);

  return (
    <RiskDatabaseModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onRiskSelected={onRiskSelected}
      riskData={riskData}
      mapSeverity={mapSeverityMIT}
      mapLikelihood={mapLikelihoodMIT}
      title="Add a new risk from risk database"
      description="Search and select a risk from the MIT AI Risk Database"
      databaseName="MIT AI Risk Database"
    />
  );
};

export default AddNewRiskMITModal;
