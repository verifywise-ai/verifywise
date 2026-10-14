import { FK_MAPPINGS, getAllTablesInOrder } from "../migrationConfig";

describe("migrationConfig", () => {
  const order = getAllTablesInOrder();

  it("remaps intake_forms.llm_key_id to the migrated llm_keys ids", () => {
    expect(FK_MAPPINGS.intake_forms).toEqual({ llm_key_id: "llm_keys" });
  });

  it("migrates every FK source table before the table that references it", () => {
    const outOfOrder: string[] = [];
    for (const [table, columns] of Object.entries(FK_MAPPINGS)) {
      const tableIndex = order.indexOf(table);
      if (tableIndex === -1) continue;
      for (const [column, sourceTable] of Object.entries(columns)) {
        const sourceIndex = order.indexOf(sourceTable);
        if (sourceIndex === -1 || sourceTable === table) continue;
        if (sourceIndex > tableIndex) outOfOrder.push(`${table}.${column} -> ${sourceTable}`);
      }
    }
    expect(outOfOrder).toEqual([]);
  });
});
