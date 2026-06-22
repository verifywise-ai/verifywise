import { displayFormattedDate } from "../../tools/isoDateToString";
import type { CustomFieldType } from "../../../domain/interfaces/i.customField";

export interface CustomFieldDefLike {
  field_type: CustomFieldType | string;
  label?: string;
}

export interface RowCustomFieldValue {
  definition_id: number;
  field_key: string;
  label: string;
  field_type: CustomFieldType | string;
  value: unknown;
}

/**
 * Render a custom field value as a human-readable string for table cells.
 * Pass `users` (from useUsers) to resolve user-type values to "Name Surname".
 */
export function formatCustomFieldValue(
  def: CustomFieldDefLike,
  raw: unknown,
  users?: Array<{ id: number; name: string; surname?: string }>,
): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (def.field_type === "boolean") return raw ? "Yes" : "No";
  if (def.field_type === "multiselect" && Array.isArray(raw)) return raw.join(", ");
  if (def.field_type === "date") {
    const s = String(raw);
    return s ? displayFormattedDate(s) : "—";
  }
  if (def.field_type === "user") {
    const id = Number(raw);
    if (!Number.isFinite(id)) return String(raw);
    const u = users?.find((user) => user.id === id);
    return u ? `${u.name} ${u.surname ?? ""}`.trim() : String(raw);
  }
  return String(raw);
}
