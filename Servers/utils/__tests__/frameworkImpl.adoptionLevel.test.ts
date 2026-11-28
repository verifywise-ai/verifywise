import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import { FRAMEWORK_STRUCTURES } from "../../structures";
import {
  adoptionLevelColumn,
  InvalidAdoptionLevelError,
  parseAdoptionLevel,
  updateImplQuery,
  validateAdoptionLevel,
} from "../frameworkImpl.utils";
import { adoptionLevelLabel } from "../../services/reporting/adoptionLevel";

const query = sequelize.query as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const naii = FRAMEWORK_STRUCTURES.find((s) => s.key === "saudi-naii")!;
const other = FRAMEWORK_STRUCTURES.find((s) => !s.adoption_levels)!;
const transaction = {} as never;

describe("parseAdoptionLevel", () => {
  it("leaves an absent level alone and clears an empty one", () => {
    expect(parseAdoptionLevel(undefined)).toBeUndefined();
    expect(parseAdoptionLevel("")).toBeNull();
    expect(parseAdoptionLevel(null)).toBeNull();
  });

  it("accepts 0 to 5 as strings or numbers", () => {
    expect(parseAdoptionLevel("0")).toBe(0);
    expect(parseAdoptionLevel(" 5 ")).toBe(5);
    expect(parseAdoptionLevel(3)).toBe(3);
  });

  it.each(["6", "-1", "2.5", "high", "1e1", " "])("rejects %p", (raw) => {
    expect(() => parseAdoptionLevel(raw)).toThrow(InvalidAdoptionLevelError);
  });
});

describe("adoptionLevelColumn", () => {
  it("selects the column only for level 2 of a framework with levels", () => {
    expect(naii.adoption_levels).toBe(true);
    expect(adoptionLevelColumn(naii, "l2")).toBe("i.adoption_level");
    expect(adoptionLevelColumn(naii, "l3")).toBe("NULL::smallint AS adoption_level");
    expect(adoptionLevelColumn(other, "l2")).toBe("NULL::smallint AS adoption_level");
  });
});

describe("validateAdoptionLevel", () => {
  it("allows a level only on level 2 of a framework with levels", () => {
    expect(validateAdoptionLevel(naii, "l2", "2")).toBe(2);
    expect(validateAdoptionLevel(naii, "l2", undefined)).toBeUndefined();
    expect(validateAdoptionLevel(other, "l2", undefined)).toBeUndefined();
    expect(() => validateAdoptionLevel(naii, "l3", "2")).toThrow(InvalidAdoptionLevelError);
    expect(() => validateAdoptionLevel(other, "l2", "")).toThrow(InvalidAdoptionLevelError);
  });
});

describe("updateImplQuery adoption level", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([]);
  });

  const update = (frameworkId: number, adoption_level: unknown) =>
    updateImplQuery(
      frameworkId,
      "l2",
      7,
      1,
      { adoption_level: adoption_level as string },
      [],
      [],
      transaction,
    );

  it("writes a level on Saudi NAII", async () => {
    await update(naii.id, "4");
    const [sql, opts] = query.mock.calls[0] as [string, { replacements: Record<string, unknown> }];
    expect(sql).toContain("adoption_level = :adoption_level");
    expect(sql).toContain(naii.tables.l2_impl);
    expect(opts.replacements.adoption_level).toBe(4);
  });

  it("clears the level with an empty value", async () => {
    await update(naii.id, "");
    const [, opts] = query.mock.calls[0] as [string, { replacements: Record<string, unknown> }];
    expect(opts.replacements.adoption_level).toBeNull();
  });

  it("refuses a level on a framework without levels", async () => {
    await expect(update(other.id, "2")).rejects.toThrow(InvalidAdoptionLevelError);
    expect(query).not.toHaveBeenCalled();
  });
});

describe("adoptionLevelLabel", () => {
  it("names the level as the index document does", () => {
    expect(adoptionLevelLabel(0)).toBe("0: Absence of capabilities");
    expect(adoptionLevelLabel(3)).toBe("3: Managed");
    expect(adoptionLevelLabel(5)).toBe("5: Pioneer");
  });

  it("says not assessed for no level or an out-of-range one", () => {
    expect(adoptionLevelLabel(null)).toBe("Not assessed");
    expect(adoptionLevelLabel(undefined)).toBe("Not assessed");
    expect(adoptionLevelLabel(6)).toBe("Not assessed");
  });
});
