import { appendToAuditLedger } from "./auditLedger.utils";
import { logFailure } from "./logger/logHelper";
import { formatScore, formatScoredOption, IScoredOption } from "./customFieldScoredSelect.utils";
import type { CustomFieldEntityType, ICustomFieldDefinition } from "./customField.utils";

/**
 * Answers moved from a removed option to another option. For select and
 * multiselect fields an option's id is its text.
 */
export interface MovedAnswers {
  from: { id: string; label: string };
  to: { id: string; label: string };
  count: number;
}

/** Answers deleted with a removed option instead of moved. */
export interface ClearedAnswers {
  from: { id: string; label: string };
  count: number;
}

export interface LedgerChange {
  eventType: "Create" | "Update" | "Delete";
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  description: string;
}

const ENTITY_PLURALS: Record<CustomFieldEntityType, string> = {
  vendor: "Vendors",
  policy: "Policies",
  project: "Use cases",
  project_risk: "Project risks",
  vendor_risk: "Vendor risks",
  model_inventory: "Models",
  task: "Tasks",
  model_risk: "Model risks",
};

const describeField = (def: ICustomFieldDefinition): string =>
  `${ENTITY_PLURALS[def.entity_type]} · ${def.label}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The audit-ledger entries for one definition change: create (before = null),
 * delete (after = null) or update. One entry per changed property; a reorder
 * of options changes nothing a score depends on and is not recorded.
 */
export const diffDefinitionForLedger = (
  before: ICustomFieldDefinition | null,
  after: ICustomFieldDefinition | null,
  extra: { moved?: MovedAnswers[]; cleared?: ClearedAnswers[]; lostAnswers?: number } = {},
): LedgerChange[] => {
  if (!before && after) {
    return [
      {
        eventType: "Create",
        fieldName: null,
        oldValue: null,
        newValue: null,
        description: describeField(after),
      },
    ];
  }
  if (before && !after) {
    return [
      {
        eventType: "Delete",
        fieldName: null,
        oldValue: null,
        newValue: null,
        description: `${describeField(before)} · ${plural(extra.lostAnswers ?? 0, "record", "records")} lost their answer`,
      },
    ];
  }
  if (!before || !after) return [];

  const description = describeField(after);
  const changes: LedgerChange[] = [];
  const update = (
    fieldName: string,
    oldValue: string | null,
    newValue: string | null,
    desc = description,
  ) => changes.push({ eventType: "Update", fieldName, oldValue, newValue, description: desc });

  if (before.label !== after.label) update("label", before.label, after.label);
  if (before.required !== after.required)
    update("required", String(before.required), String(after.required));

  if (after.field_type === "scored_select") {
    const prev = (before.options ?? []) as IScoredOption[];
    const next = (after.options ?? []) as IScoredOption[];
    const prevById = new Map(prev.map((o) => [o.id, o]));
    for (const option of next) {
      const old = prevById.get(option.id);
      if (!old) {
        update("option", null, formatScoredOption(option));
        continue;
      }
      if (old.label !== option.label) update("option label", old.label, option.label);
      if (old.score !== option.score) {
        update(`option score: ${option.label}`, formatScore(old.score), formatScore(option.score));
      }
    }
    const kept = new Set(next.map((o) => o.id));
    for (const option of prev) {
      if (kept.has(option.id)) continue;
      const move = extra.moved?.find((m) => m.from.id === option.id);
      const clear = extra.cleared?.find((c) => c.from.id === option.id);
      update(
        "option",
        formatScoredOption(option),
        null,
        move
          ? `${description} · ${plural(move.count, "answer", "answers")} moved to ${move.to.label}`
          : clear
            ? `${description} · ${plural(clear.count, "answer", "answers")} removed`
            : description,
      );
    }
  } else {
    const prev = (before.options ?? []) as string[];
    const next = (after.options ?? []) as string[];
    if ([...prev].sort().join("\u0000") !== [...next].sort().join("\u0000")) {
      update("options", prev.join(", "), next.join(", "));
    }
    for (const move of extra.moved ?? []) {
      update(
        "option",
        move.from.label,
        null,
        `${description} · ${plural(move.count, "answer", "answers")} moved to ${move.to.label}`,
      );
    }
    for (const clear of extra.cleared ?? []) {
      update(
        "option",
        clear.from.label,
        null,
        `${description} · ${plural(clear.count, "answer", "answers")} removed`,
      );
    }
  }
  return changes;
};

/** Write ledger entries after the change committed. Best-effort, like FRIA: never throws. */
export const recordDefinitionChanges = async (
  organizationId: number,
  userId: number | null,
  definitionId: number,
  changes: LedgerChange[],
): Promise<void> => {
  for (const change of changes) {
    try {
      await appendToAuditLedger({
        organizationId,
        entryType: "event_log",
        userId,
        eventType: change.eventType,
        entityType: "custom_field_definition",
        entityId: definitionId,
        fieldName: change.fieldName,
        oldValue: change.oldValue,
        newValue: change.newValue,
        description: change.description,
      });
    } catch (error) {
      try {
        await logFailure({
          eventType: change.eventType,
          description: "Failed to write a custom field change to the audit ledger",
          functionName: "recordDefinitionChanges",
          fileName: "customFieldAudit.utils.ts",
          error: error as Error,
          userId: userId ?? 0,
          organizationId,
        });
      } catch {
        // Logging must not break the request either.
      }
    }
  }
};
