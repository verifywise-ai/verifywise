import { useLayoutEffect, useState } from "react";
import RiskDatabaseModal from "../RiskDatabaseModal";
import { RiskData } from "../RiskDatabaseModal/types";
import { RiskFormValues } from "../../../domain/types/riskForm.types";
import { riskCatalogs, RiskCatalogSource } from "./riskCatalogs";

interface RiskCatalogModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  source: RiskCatalogSource;
  onRiskSelected?: (riskData: RiskFormValues) => void;
}

/**
 * Modal for adding a new risk from a risk database catalog (IBM or MIT).
 * Uses the shared RiskDatabaseModal component with catalog-specific mappers,
 * strings and data loading resolved from the `source` prop.
 */
const RiskCatalogModal = ({ isOpen, setIsOpen, source, onRiskSelected }: RiskCatalogModalProps) => {
  const config = riskCatalogs[source];
  const [riskData, setRiskData] = useState<RiskData[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Loads catalog data on first open. Runs as a layout effect so catalogs
  // with synchronously available data (IBM) populate state before paint and
  // the modal never flashes its empty state. Async catalogs (MIT) resolve in
  // a promise; a failed load leaves `loaded` false so the next open retries.
  useLayoutEffect(() => {
    if (!isOpen || loaded) return;
    const data = config.loadData();
    if (data instanceof Promise) {
      data
        .then((resolvedData) => {
          setRiskData(resolvedData);
          setLoaded(true);
        })
        .catch(() => {});
    } else {
      setRiskData(data);
      setLoaded(true);
    }
  }, [isOpen, loaded, config]);

  return (
    <RiskDatabaseModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      onRiskSelected={onRiskSelected}
      riskData={riskData}
      mapSeverity={config.mapSeverity}
      mapLikelihood={config.mapLikelihood}
      title={config.title}
      description={config.description}
      databaseName={config.databaseName}
    />
  );
};

export default RiskCatalogModal;
