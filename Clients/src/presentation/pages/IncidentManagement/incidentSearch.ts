import { AIIncidentManagementModel } from "../../../domain/models/Common/incidentManagement/incidentManagement.model";

/**
 * Whether an incident matches the page search: its visible ID ("INC-12"),
 * use case or reporter, ignoring case and surrounding spaces. An empty
 * search matches every incident.
 */
export const incidentMatchesSearch = (
  incident: AIIncidentManagementModel,
  searchTerm: string,
): boolean => {
  const search = searchTerm.trim().toLowerCase();
  if (!search) return true;
  return (
    (incident.incident_id || "").toLowerCase().includes(search) ||
    (incident.ai_project || "").toLowerCase().includes(search) ||
    AIIncidentManagementModel.reporterLabel(incident).toLowerCase().includes(search)
  );
};
