import { RaciRole } from "../../../../../domain/enums/raci.enum";
import type {
  RaciRow,
  RaciSource,
  RaciWarning,
} from "../../../../../application/repository/raci.repository";

export const RACI_ROLES: readonly RaciRole[] = [
  RaciRole.RESPONSIBLE,
  RaciRole.ACCOUNTABLE,
  RaciRole.CONSULTED,
  RaciRole.INFORMED,
];

export const RACI_ROLE_NAMES: Record<RaciRole, string> = {
  [RaciRole.RESPONSIBLE]: "Responsible",
  [RaciRole.ACCOUNTABLE]: "Accountable",
  [RaciRole.CONSULTED]: "Consulted",
  [RaciRole.INFORMED]: "Informed",
};

export const RACI_LEGEND: Record<RaciRole, string> = {
  [RaciRole.RESPONSIBLE]: "Responsible: does the work",
  [RaciRole.ACCOUNTABLE]: "Accountable: answers for the outcome",
  [RaciRole.CONSULTED]: "Consulted: gives input before decisions",
  [RaciRole.INFORMED]: "Informed: kept up to date",
};

export const RACI_SOURCE_LABELS: Record<RaciSource, string> = {
  owner: "Owner of this use case",
  member: "Team member of this use case",
  approver: "Approver in this use case's approval workflow",
  task_assignee: "Assigned to an open task linked to this use case",
  manual: "Added manually",
};

export const RACI_SAVE_ERROR_MESSAGE = "The role change could not be saved. Please try again.";

export const RACI_WARNING_MESSAGES: Record<RaciWarning, string> = {
  no_accountable: "No one is accountable for this use case yet. Give one person the A role.",
  multiple_accountable:
    "More than one person is accountable for this use case. Keep one person in the A role where you can.",
};

export const RACI_EXPORT_COLUMNS = [
  { id: "name", label: "Name" },
  { id: "email", label: "Email" },
  { id: "roles", label: "Roles" },
  { id: "source", label: "Source" },
];

export const describeSources = (sources: RaciSource[]): string =>
  sources.map((source) => RACI_SOURCE_LABELS[source]).join(". ");

/** One export row per person, built from the rows already on screen. */
export function buildRaciExportRows(rows: RaciRow[]) {
  return rows.map((row) => ({
    name: row.name,
    email: row.email ?? "",
    roles: row.roles.map(({ role }) => role).join(", "),
    source: row.roles.map(({ role, sources }) => `${role}: ${describeSources(sources)}`).join("; "),
  }));
}
