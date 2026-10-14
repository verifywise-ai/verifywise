import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockAppend = jest.fn(async (..._args: any[]): Promise<void> => undefined);
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: (...args: any[]) => mockAppend(...args),
}));
jest.mock("../logger/logHelper", () => ({ logFailure: jest.fn(async () => undefined) }));

import { diffDefinitionForLedger, recordDefinitionChanges } from "../customFieldAudit.utils";

const base = {
  id: 11,
  organization_id: 7,
  entity_type: "project" as const,
  field_key: "feasibility",
  label: "Technical feasibility",
  field_type: "scored_select" as const,
  required: false,
  created_by: 1,
  created_at: new Date(),
  updated_at: new Date(),
  options: [
    { id: "opt_1", label: "High", score: 3 },
    { id: "opt_2", label: "Medium", score: 2 },
    { id: "opt_3", label: "Low", score: 1 },
  ],
};

beforeEach((): void => {
  mockAppend.mockReset();
});

describe("diffDefinitionForLedger", () => {
  it("records create and delete", () => {
    expect(diffDefinitionForLedger(null, base)).toEqual([
      expect.objectContaining({
        eventType: "Create",
        description: "Use cases · Technical feasibility",
      }),
    ]);
    const [del] = diffDefinitionForLedger(base, null, { lostAnswers: 12 });
    expect(del.eventType).toBe("Delete");
    expect(del.description).toBe(
      "Use cases · Technical feasibility · 12 records lost their answer",
    );
  });

  it("records label and required changes", () => {
    const changes = diffDefinitionForLedger(base, {
      ...base,
      label: "Feasibility",
      required: true,
    });
    expect(changes).toEqual([
      expect.objectContaining({
        fieldName: "label",
        oldValue: "Technical feasibility",
        newValue: "Feasibility",
      }),
      expect.objectContaining({ fieldName: "required", oldValue: "false", newValue: "true" }),
    ]);
  });

  it("records one entry per scored option change and none for a reorder", () => {
    const after = {
      ...base,
      options: [
        { id: "opt_3", label: "Minimal", score: 1 },
        { id: "opt_1", label: "High", score: 4 },
        { id: "opt_9", label: "Extreme", score: 5 },
      ],
    };
    const changes = diffDefinitionForLedger(base, after, {
      moved: [{ from: base.options[1], to: after.options[0], count: 80 }],
    });
    expect(changes).toEqual([
      expect.objectContaining({ fieldName: "option label", oldValue: "Low", newValue: "Minimal" }),
      expect.objectContaining({ fieldName: "option score: High", oldValue: "3", newValue: "4" }),
      expect.objectContaining({ fieldName: "option", oldValue: null, newValue: "Extreme (5)" }),
      expect.objectContaining({
        fieldName: "option",
        oldValue: "Medium (2)",
        newValue: null,
        description: "Use cases · Technical feasibility · 80 answers moved to Minimal",
      }),
    ]);
    const reordered = { ...base, options: [...base.options].reverse() };
    expect(diffDefinitionForLedger(base, reordered)).toEqual([]);
  });

  it("records select option changes as one entry, ignoring order", () => {
    const select = { ...base, field_type: "select" as const, options: ["US", "EU"] };
    expect(diffDefinitionForLedger(select, { ...select, options: ["EU", "US"] })).toEqual([]);
    expect(diffDefinitionForLedger(select, { ...select, options: ["US", "APAC"] })).toEqual([
      expect.objectContaining({ fieldName: "options", oldValue: "US, EU", newValue: "US, APAC" }),
    ]);
  });
});

describe("recordDefinitionChanges", () => {
  it("writes one event_log entry per change", async () => {
    await recordDefinitionChanges(
      7,
      3,
      11,
      diffDefinitionForLedger(base, { ...base, label: "X", required: true }),
    );
    expect(mockAppend).toHaveBeenCalledTimes(2);
    expect(mockAppend.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        organizationId: 7,
        userId: 3,
        entryType: "event_log",
        eventType: "Update",
        entityType: "custom_field_definition",
        entityId: 11,
        fieldName: "label",
      }),
    );
  });

  it("never throws when the ledger write fails", async () => {
    mockAppend.mockRejectedValue(new Error("ledger down"));
    await expect(
      recordDefinitionChanges(7, 3, 11, diffDefinitionForLedger(null, base)),
    ).resolves.toBeUndefined();
  });
});
