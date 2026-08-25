import { IVendor } from "../../domain.layer/interfaces/i.vendor";

// Mock the sequelize instance so we can capture the replacements passed to
// the INSERT/UPDATE queries built by vendor.utils.ts, without hitting a
// real database.
const queryMock = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: {
    query: (...args: any[]) => queryMock(...args),
  },
}));

// Avoid pulling in the real project-updated-by-id query (it issues its own
// sequelize.query calls with a different shape than we're stubbing here).
jest.mock("../../utils/project.utils", () => ({
  getUserProjects: jest.fn().mockResolvedValue([]),
  updateProjectUpdatedByIdQuery: jest.fn().mockResolvedValue(undefined),
}));

// Avoid queueing real automation jobs (Redis/BullMQ) during unit tests.
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn().mockResolvedValue(undefined),
}));

import {
  createNewVendorQuery,
  updateVendorByIdQuery,
  getDoraRegisterQuery,
} from "../../utils/vendor.utils";

describe("vendor.utils DORA fields", () => {
  const baseVendor: IVendor = {
    vendor_name: "ACME Cloud",
    vendor_provides: "Hosting",
    assignee: 1,
    website: "https://acme.example",
    vendor_contact_person: "Jo",
    is_ict_provider: true,
    ict_service_type: "Cloud services",
    function_criticality: "Critical",
    substitutability: "Not substitutable",
    has_exit_plan: false,
    country_of_provision: "IE",
    provider_lei: "LEI123",
  };

  beforeEach(() => {
    queryMock.mockReset();
  });

  it("includes DORA fields in the create replacements when provided", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.startsWith("INSERT INTO vendors")) {
        return Promise.resolve([{ id: 1, dataValues: { id: 1 } }]);
      }
      // Automation lookup query (and any other incidental query) — return
      // an empty result set so downstream code short-circuits harmlessly.
      return Promise.resolve([[], 0]);
    });

    const transaction = {} as any;
    await createNewVendorQuery(baseVendor, 1, transaction);

    const insertCall = queryMock.mock.calls.find(([sql]) =>
      typeof sql === "string" ? sql.startsWith("INSERT INTO vendors") : false,
    );
    expect(insertCall).toBeDefined();
    const [, options] = insertCall as [string, { replacements: Record<string, any> }];
    const replacements = options.replacements;

    expect(replacements).toMatchObject({
      is_ict_provider: true,
      ict_service_type: "Cloud services",
      function_criticality: "Critical",
      substitutability: "Not substitutable",
      has_exit_plan: false,
      country_of_provision: "IE",
      provider_lei: "LEI123",
    });
  });

  it("defaults the DORA boolean fields to false when omitted on create", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.startsWith("INSERT INTO vendors")) {
        return Promise.resolve([{ id: 1, dataValues: { id: 1 } }]);
      }
      return Promise.resolve([[], 0]);
    });

    const transaction = {} as any;
    const { is_ict_provider, has_exit_plan, ...vendorWithoutBooleans } = baseVendor;
    await createNewVendorQuery(vendorWithoutBooleans as IVendor, 1, transaction);

    const insertCall = queryMock.mock.calls.find(([sql]) =>
      typeof sql === "string" ? sql.startsWith("INSERT INTO vendors") : false,
    );
    const [, options] = insertCall as [string, { replacements: Record<string, any> }];

    expect(options.replacements.is_ict_provider).toBe(false);
    expect(options.replacements.has_exit_plan).toBe(false);
  });

  it("coerces empty-string DORA enum fields to null on create (avoids Postgres enum error)", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.startsWith("INSERT INTO vendors")) {
        return Promise.resolve([{ id: 1, dataValues: { id: 1 } }]);
      }
      return Promise.resolve([[], 0]);
    });

    const transaction = {} as any;
    const vendorWithEmptyEnums: IVendor = {
      ...baseVendor,
      ict_service_type: "" as any,
      function_criticality: "" as any,
      substitutability: "" as any,
    };
    await createNewVendorQuery(vendorWithEmptyEnums, 1, transaction);

    const insertCall = queryMock.mock.calls.find(([sql]) =>
      typeof sql === "string" ? sql.startsWith("INSERT INTO vendors") : false,
    );
    const [, options] = insertCall as [string, { replacements: Record<string, any> }];

    expect(options.replacements.ict_service_type).toBeNull();
    expect(options.replacements.function_criticality).toBeNull();
    expect(options.replacements.substitutability).toBeNull();
  });

  it("includes DORA fields in the update set clause and replacements when provided", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.startsWith("SELECT * FROM vendors")) {
        // getVendorByIdQuery's lookup of the existing vendor
        return Promise.resolve([
          {
            dataValues: { id: 1, vendor_name: "ACME Cloud" },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      }
      if (typeof sql === "string" && sql.startsWith("UPDATE vendors")) {
        return Promise.resolve([{ id: 1, dataValues: { id: 1 } }]);
      }
      if (typeof sql === "string" && sql.startsWith("SELECT project_id FROM vendors_projects")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([[], 0]);
    });

    const transaction = {} as any;
    await updateVendorByIdQuery(
      {
        id: 1,
        vendor: {
          is_ict_provider: true,
          ict_service_type: "Security services",
          function_criticality: "Important",
          substitutability: "Difficult to substitute",
          has_exit_plan: true,
          country_of_provision: "DE",
          provider_lei: "LEI456",
        },
        userId: 1,
        role: "Admin",
        transaction,
      },
      1,
    );

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      typeof sql === "string" ? sql.startsWith("UPDATE vendors") : false,
    );
    expect(updateCall).toBeDefined();
    const [sql, options] = updateCall as [string, { replacements: Record<string, any> }];

    for (const field of [
      "is_ict_provider",
      "ict_service_type",
      "function_criticality",
      "substitutability",
      "has_exit_plan",
      "country_of_provision",
      "provider_lei",
    ]) {
      expect(sql).toContain(`${field} = :${field}`);
    }

    expect(options.replacements).toMatchObject({
      is_ict_provider: true,
      ict_service_type: "Security services",
      function_criticality: "Important",
      substitutability: "Difficult to substitute",
      has_exit_plan: true,
      country_of_provision: "DE",
      provider_lei: "LEI456",
    });
  });

  it("coerces empty-string DORA enum fields to null on update (avoids Postgres enum error)", async () => {
    queryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.startsWith("SELECT * FROM vendors")) {
        return Promise.resolve([
          {
            dataValues: { id: 1, vendor_name: "ACME Cloud" },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      }
      if (typeof sql === "string" && sql.startsWith("UPDATE vendors")) {
        return Promise.resolve([{ id: 1, dataValues: { id: 1 } }]);
      }
      if (typeof sql === "string" && sql.startsWith("SELECT project_id FROM vendors_projects")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([[], 0]);
    });

    const transaction = {} as any;
    await updateVendorByIdQuery(
      {
        id: 1,
        vendor: {
          // Simulates an unselected dropdown submitting "" instead of omitting the field
          ict_service_type: "" as any,
          function_criticality: "" as any,
          substitutability: "" as any,
        },
        userId: 1,
        role: "Admin",
        transaction,
      },
      1,
    );

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      typeof sql === "string" ? sql.startsWith("UPDATE vendors") : false,
    );
    const [, options] = updateCall as [string, { replacements: Record<string, any> }];

    expect(options.replacements.ict_service_type).toBeNull();
    expect(options.replacements.function_criticality).toBeNull();
    expect(options.replacements.substitutability).toBeNull();
  });
});

describe("getDoraRegisterQuery", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("filters by org and is_ict_provider", async () => {
    const ictVendor = {
      id: 1,
      vendor_name: "ACME Cloud",
      organization_id: 7,
      is_ict_provider: true,
    };
    // Simulate the DB doing the actual filtering: only the ICT vendor for
    // org 7 comes back. A non-ICT vendor or a vendor from another org must
    // never appear here — if the implementation forgot the WHERE clause,
    // this mock has no way of knowing to exclude them, so the SQL/replacements
    // assertions below are what actually prove the filter was issued.
    queryMock.mockResolvedValue([ictVendor]);

    const result = await getDoraRegisterQuery(7);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, options] = queryMock.mock.calls[0] as [
      string,
      { replacements: Record<string, any> },
    ];

    expect(sql).toContain("is_ict_provider");
    expect(sql).toContain("organization_id = :organization_id");
    expect(options.replacements).toMatchObject({ organization_id: 7 });
    expect(result).toEqual([ictVendor]);
  });

  it("does not return non-ICT vendors (query is scoped, not filtered client-side)", async () => {
    // Only a non-ICT vendor happens to be "in the DB" for this test — proves
    // the function returns exactly what sequelize.query gives it (i.e. the
    // filtering is the SQL's job, not a client-side re-filter that could mask
    // a broken WHERE clause).
    const nonIctVendor = {
      id: 2,
      vendor_name: "Office Supplies Co",
      organization_id: 7,
      is_ict_provider: false,
    };
    queryMock.mockResolvedValue([]);

    const result = await getDoraRegisterQuery(7);

    expect(result).toEqual([]);
    expect(result).not.toContainEqual(nonIctVendor);
    const [sql] = queryMock.mock.calls[0] as [string, any];
    expect(sql).toContain("is_ict_provider = true");
  });
});
