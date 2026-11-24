/**
 * The app route that opens one incident (the incidents page reads
 * ?incidentId= and opens its drawer). Every link to an incident is built here.
 */
export const incidentPagePath = (incidentId: number | string): string =>
  `/ai-incident-managements?incidentId=${incidentId}`;
