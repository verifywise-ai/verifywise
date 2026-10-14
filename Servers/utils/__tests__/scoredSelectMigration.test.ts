import { describe, it, expect } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require("../../database/migrations/20261010090000-add-scored-select-custom-field-type.js");

/** A fake queryInterface that records SQL; SELECTs return the given rows. */
function fakeQueryInterface(scoredCount = 0) {
  const statements: string[] = [];
  return {
    statements,
    sequelize: {
      query: async (sql: string) => {
        statements.push(sql.replace(/\s+/g, " ").trim());
        return /^SELECT/i.test(sql.trim()) ? [[{ count: scoredCount }], {}] : [[], {}];
      },
    },
  };
}

describe("add-scored-select-custom-field-type migration", () => {
  it("up re-creates the field type CHECK with scored_select", async () => {
    const qi = fakeQueryInterface();
    await migration.up(qi);
    expect(qi.statements).toHaveLength(1);
    expect(qi.statements[0]).toContain("DROP CONSTRAINT IF EXISTS cfd_field_type_allowed");
    expect(qi.statements[0]).toContain(
      "CHECK (field_type IN ('text','number','date','boolean','select','multiselect','user','scored_select'))",
    );
  });

  it("up lets scored_select carry options in the options shape CHECK", async () => {
    const qi = fakeQueryInterface();
    await migration.up(qi);
    expect(qi.statements[0]).toContain("DROP CONSTRAINT IF EXISTS cfd_options_shape");
    expect(qi.statements[0]).toContain(
      "CHECK ( ( field_type IN ('select','multiselect','scored_select') AND jsonb_typeof(options) = 'array' AND jsonb_array_length(options) > 0 ) OR (field_type NOT IN ('select','multiselect','scored_select') AND options IS NULL) )",
    );
  });

  it("down restores the original CHECK when no scored field exists", async () => {
    const qi = fakeQueryInterface(0);
    await migration.down(qi);
    expect(qi.statements[1]).toContain(
      "CHECK (field_type IN ('text','number','date','boolean','select','multiselect','user'))",
    );
    expect(qi.statements[1]).toContain(
      "OR (field_type NOT IN ('select','multiselect') AND options IS NULL)",
    );
  });

  it("down refuses to drop customer data when scored fields exist", async () => {
    const qi = fakeQueryInterface(2);
    await expect(migration.down(qi)).rejects.toThrow(/2 scored select/);
    expect(qi.statements).toHaveLength(1);
  });
});
