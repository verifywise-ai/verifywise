import { useState, useEffect } from "react";
import RiskDatabaseModal from "../RiskDatabaseModal";
import { RiskData, SelectedRiskData } from "../RiskDatabaseModal/types";
import { Likelihood, Severity } from "../RiskLevel/constants";

interface AddNewRiskMITModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRiskSelected?: (riskData: SelectedRiskData) => void;
}

/**
 * Maps MIT severity strings to Severity enum.
 * MIT uses Negligible/Minor/Moderate/Major/Catastrophic severity scale.
 */
const mapSeverityMIT = (severity: string): Severity => {
  switch (severity.toLowerCase()) {
    case "negligible":
      return Severity.Negligible;
    case "minor":
      return Severity.Minor;
    case "moderate":
      return Severity.Moderate;
    case "major":
      return Severity.Major;
    case "catastrophic":
      return Severity.Catastrophic;
    default:
      return Severity.Moderate;
  }
};

/**
 * Maps MIT likelihood strings to Likelihood enum.
 * MIT uses Rare/Unlikely/Possible/Likely/Almost Certain likelihood scale.
 */
const mapLikelihoodMIT = (likelihood: string): Likelihood => {
  switch (likelihood.toLowerCase()) {
    case "rare":
      return Likelihood.Rare;
    case "unlikely":
      return Likelihood.Unlikely;
    case "possible":
      return Likelihood.Possible;
    case "likely":
      return Likelihood.Likely;
    case "almost certain":
      return Likelihood.AlmostCertain;
    default:
      return Likelihood.Possible;
  }
};

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
