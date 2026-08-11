/**
 * @fileoverview Pins the invariant that makes the !isOrganizationalProject
 * guard at dataCollector.ts:238 redundant.
 *
 * frameworks seeds EU AI Act with is_organizational = false and ISO 42001,
 * ISO 27001 and NIST AI RMF with true; createNewProjectQuery rejects a
 * framework whose flag differs from the project's. So frameworkId === 1
 * implies !isOrganizationalProject, and the guard never removes a target.
 *
 * If a future migration flips EU AI Act's flag, that guard starts emptying
 * every EU AI Act report. This test fails first.
 *
 * @module tests/frameworkInvariant
 */

import * as fs from "fs";
import * as path from "path";

describe("frameworks.is_organizational", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "../../../database/migrations/20260226234301-public-schema-tables.js"),
    "utf-8",
  );

  it("seeds EU AI Act as non-organizational", () => {
    expect(migration).toContain("(1, 'EU AI Act'");
    const line = migration.split("\n").find((l) => l.includes("'EU AI Act'"));
    expect(line).toMatch(/false\s*\)/);
  });

  it("seeds ISO 42001, ISO 27001 and NIST AI RMF as organizational", () => {
    for (const name of ["ISO 42001", "ISO 27001", "NIST AI RMF"]) {
      const line = migration.split("\n").find((l) => l.includes(`'${name}'`));
      expect(line).toMatch(/true\s*\)/);
    }
  });
});
