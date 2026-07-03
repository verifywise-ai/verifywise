/** Convert an ISO date/string to the yyyy-mm-dd value a native date input expects. */
export const toIsoDateInput = (value?: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};
