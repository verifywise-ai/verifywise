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

import { createNewVendorQuery, updateVendorByIdQuery } from "../../utils/vendor.utils";

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
});
