import { AIIncidentManagementModel } from "../../../domain/models/Common/incidentManagement/incidentManagement.model";

/**
 * Which incidents the list shows: active ones (the default), active and
 * archived, or archived only. Archiving is reversible from the archived rows.
 */
export type IncidentArchiveView = "active" | "all" | "archived";

export const INCIDENT_ARCHIVE_VIEW_OPTIONS: { _id: IncidentArchiveView; name: string }[] = [
  { _id: "active", name: "Active only" },
  { _id: "all", name: "Active + archived" },
  { _id: "archived", name: "Archived only" },
];

/** The incidents an archive view lists. */
export const incidentsForArchiveView = (
  incidents: AIIncidentManagementModel[],
  view: IncidentArchiveView,
): AIIncidentManagementModel[] => {
  if (view === "all") return incidents;
  return incidents.filter((i) => (view === "archived" ? !!i.archived : !i.archived));
};
