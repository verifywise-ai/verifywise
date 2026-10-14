// The normalization map and the enum set come from modules that transitively
// reach the database and BullMQ; the mocks keep importing them from opening
// connections. Same trio as services/riskLinks/tests/directionFilter.spec.ts.
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { MIT_RISK_CATALOG } from "../../../structures/risk-catalogs/mit";
import { IBM_RISK_CATALOG } from "../../../structures/risk-catalogs/ibm";
import { RiskCatalogEntry } from "../../../structures/risk-catalogs/types";
import { PROJECT_RISK_CATEGORIES_SET } from "../../../utils/risk.utils";
import {
  CATALOG_CATEGORY_NORMALIZATION,
  normalizeCatalogCategories,
} from "../riskSuggestions.service";

const distinctCategories = (catalog: RiskCatalogEntry[]): string[] => [
  ...new Set(catalog.flatMap((entry) => entry.riskCategories)),
];

describe("risk catalog data integrity", () => {
  it("every distinct MIT category is an exact PROJECT_RISK_CATEGORIES member", () => {
    for (const category of distinctCategories(MIT_RISK_CATALOG)) {
      expect(PROJECT_RISK_CATEGORIES_SET.has(category)).toBe(true);
    }
  });

  it("every distinct IBM category is an enum member or explicitly mapped", () => {
    for (const category of distinctCategories(IBM_RISK_CATALOG)) {
      const covered =
        PROJECT_RISK_CATEGORIES_SET.has(category) ||
        Object.prototype.hasOwnProperty.call(CATALOG_CATEGORY_NORMALIZATION, category);
      expect(covered).toBe(true);
    }
  });

  it("normalized categories of every catalog entry stay within the enum", () => {
    for (const entry of [...MIT_RISK_CATALOG, ...IBM_RISK_CATALOG]) {
      for (const category of normalizeCatalogCategories(entry.riskCategories)) {
        expect(PROJECT_RISK_CATEGORIES_SET.has(category)).toBe(true);
      }
    }
  });

  it("both catalogs have unique ids and non-empty fields", () => {
    for (const catalog of [MIT_RISK_CATALOG, IBM_RISK_CATALOG]) {
      const ids = new Set(catalog.map((entry) => entry.id));
      expect(ids.size).toBe(catalog.length);
      for (const entry of catalog) {
        expect(entry.summary.length).toBeGreaterThan(0);
        expect(entry.description.length).toBeGreaterThan(0);
        expect(entry.riskCategories.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("normalizeCatalogCategories", () => {
  it("rewrites mapped IBM categories onto the enum", () => {
    expect(normalizeCatalogCategories(["Third-party or vendor risk"])).toEqual([
      "Third-party/vendor risk",
    ]);
    expect(normalizeCatalogCategories(["Safety risk"])).toEqual(["Health and safety risk"]);
  });

  it("drops categories with no enum equivalent", () => {
    expect(normalizeCatalogCategories(["Societal risk", "Educational risk"])).toEqual([]);
  });

  it("dedupes when a mapped category collides with a verbatim one", () => {
    expect(normalizeCatalogCategories(["Safety risk", "Health and safety risk"])).toEqual([
      "Health and safety risk",
    ]);
  });
});
