import { EntityGraphData } from "../../../../application/repository/entityGraph.repository";
import { ENTITY_TYPE_TO_PLURAL } from "../constants";

/**
 * Get connected entity types based on the focused entity and data relationships.
 * Returns an array of plural entity type keys (e.g., 'models', 'vendors')
 * that are connected to the specified entity.
 */
export function getConnectedEntityTypes(
  focusEntityId: string,
  focusEntityType: string,
  entityData: EntityGraphData,
): string[] {
  const connectedTypes = new Set<string>();

  // Always include the focused entity's type
  const pluralType = ENTITY_TYPE_TO_PLURAL[focusEntityType];
  if (pluralType) connectedTypes.add(pluralType);

  // Extract the numeric ID from the focus entity ID (e.g., "risk-123" -> 123)
  const numericId = parseInt(focusEntityId.split("-")[1], 10);
  if (isNaN(numericId)) return Array.from(connectedTypes);

  switch (focusEntityType) {
    case "risk": {
      // Find the risk and check its source
      const risk = entityData.risks?.find((r) => r.id === numericId);
      if (risk) {
        if (risk.model_id) connectedTypes.add("models");
        if (risk.project_id) connectedTypes.add("useCases");
        if (risk.vendor_id) connectedTypes.add("vendors");
      }
      break;
    }
    case "model": {
      // Models connect to useCases, frameworks, and risks
      const model = entityData.models?.find((m) => m.id === numericId);
      if (model) {
        if (model.projects?.length) connectedTypes.add("useCases");
        if (model.frameworks?.length) connectedTypes.add("frameworks");
      }
      // Check if any risks are connected to this model
      if (entityData.risks?.some((r) => r.model_id === numericId)) {
        connectedTypes.add("risks");
      }
      break;
    }
    case "vendor": {
      // Vendors connect to useCases and risks
      const vendor = entityData.vendors?.find((v) => v.id === numericId);
      if (vendor?.projects?.length) connectedTypes.add("useCases");
      // Check if any risks are connected to this vendor
      if (entityData.risks?.some((r) => r.vendor_id === numericId)) {
        connectedTypes.add("risks");
      }
      break;
    }
    case "useCase": {
      // UseCases connect to models, vendors, and risks
      if (entityData.models?.some((m) => m.projects?.includes(numericId))) {
        connectedTypes.add("models");
      }
      if (entityData.vendors?.some((v) => v.projects?.includes(numericId))) {
        connectedTypes.add("vendors");
      }
      if (entityData.risks?.some((r) => r.project_id === numericId)) {
        connectedTypes.add("risks");
      }
      break;
    }
    case "framework": {
      // Frameworks connect to models
      if (entityData.models?.some((m) => m.frameworks?.includes(numericId))) {
        connectedTypes.add("models");
      }
      break;
    }
    case "evidence": {
      // Evidence can connect to models
      const evidence = entityData.evidence?.find((e) => e.id === numericId);
      if (evidence?.mapped_model_ids?.length) {
        connectedTypes.add("models");
      }
      break;
    }
  }

  return Array.from(connectedTypes);
}
