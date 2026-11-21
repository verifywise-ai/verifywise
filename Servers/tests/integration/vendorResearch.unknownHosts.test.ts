jest.setTimeout(60000);

/**
 * The query of the unknown-host script (M2 Task 11, Ruling 13 of the M2 plan) against the real
 * runs table of the test database: the hosts in the traces of completed runs, counted once per run
 * and by organization, across organizations, as the maintainer who reviews the registry reads them.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis.
import "./setup";
import { cleanupDatabase, createTestOrganization } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import { createRunQuery } from "../../utils/vendorResearch.utils";
import { unknownHostsQuery } from "../../scripts/vendorResearchUnknownHosts";

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(async () => {
  await sequelize.close();
});

/** A run of a vendor of the organization, with its status, its age and the hosts its trace lists. */
async function seedRun(
  organizationId: number,
  vendorId: number,
  options: { status: string; daysAgo: number; hosts: unknown },
): Promise<void> {
  const run = await createRunQuery({
    organizationId,
    vendorId,
    triggerType: "manual",
    requestedBy: null,
  });
  await sequelize.query(
    `UPDATE vendor_research_runs
     SET status = :status,
         created_at = NOW() - (:daysAgo * INTERVAL '1 day'),
         finished_at = NOW() - (:daysAgo * INTERVAL '1 day'),
         trace = CAST(:trace AS jsonb)
     WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: {
        organizationId,
        id: run.id,
        status: options.status,
        daysAgo: options.daysAgo,
        trace: JSON.stringify({
          cited: { categories: {}, unreviewedHosts: options.hosts },
        }),
      },
    },
  );
}

describe("the unknown hosts, in the database", () => {
  it("counts a host cited in two organizations' runs once per run", async () => {
    const first = await createTestOrganization("Hosts org A");
    const second = await createTestOrganization("Hosts org B");
    const firstVendor = await createTestVendor(first, { vendor_name: "Acme Analytics" });
    const otherVendor = await createTestVendor(first, { vendor_name: "Other Co" });
    const secondVendor = await createTestVendor(second, { vendor_name: "Acme Analytics" });

    await seedRun(first, firstVendor, {
      status: "completed",
      daysAgo: 1,
      hosts: ["blog.example", "news.example"],
    });
    await seedRun(first, otherVendor, {
      status: "completed",
      daysAgo: 10,
      hosts: ["blog.example"],
    });
    // A host the trace lists twice is one citation of that run.
    await seedRun(second, secondVendor, {
      status: "completed",
      daysAgo: 30,
      hosts: ["blog.example", "blog.example"],
    });
    // A failed run, a run older than the window, and a trace without the list count for nothing.
    await seedRun(second, secondVendor, { status: "failed", daysAgo: 2, hosts: ["blog.example"] });
    await seedRun(second, secondVendor, {
      status: "completed",
      daysAgo: 120,
      hosts: ["old.example"],
    });
    await seedRun(second, secondVendor, { status: "completed", daysAgo: 3, hosts: "blog.example" });

    await expect(unknownHostsQuery(90, 50)).resolves.toEqual([
      { host: "blog.example", runs: 3, organizations: 2 },
      { host: "news.example", runs: 1, organizations: 1 },
    ]);
    await expect(unknownHostsQuery(90, 1)).resolves.toEqual([
      { host: "blog.example", runs: 3, organizations: 2 },
    ]);
    await expect(unknownHostsQuery(5, 50)).resolves.toEqual([
      { host: "blog.example", runs: 1, organizations: 1 },
      { host: "news.example", runs: 1, organizations: 1 },
    ]);
    await expect(unknownHostsQuery(365, 50)).resolves.toEqual([
      { host: "blog.example", runs: 3, organizations: 2 },
      { host: "news.example", runs: 1, organizations: 1 },
      { host: "old.example", runs: 1, organizations: 1 },
    ]);
  });
});
