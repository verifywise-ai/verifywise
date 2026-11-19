import fs from "node:fs";
import path from "node:path";

/**
 * Every notice in the client registry needs a change_notice_releases row, or it
 * falls back to the organization rule and the first users of a new organization
 * see a change they never experienced. Release rows are inserted by migrations.
 */
const REGISTRY = path.join(
  __dirname,
  "../../../../Clients/src/presentation/components/ChangeNotice/notices.ts",
);
const MIGRATIONS = path.join(__dirname, "../../../database/migrations");

const registryIds = (): string[] => {
  const src = fs.readFileSync(REGISTRY, "utf8");
  return [...src.matchAll(/^\s*id:\s*"([a-z0-9-]+)"/gm)].map((match) => match[1]);
};

const releasedIds = (): Set<string> => {
  const ids = new Set<string>();
  for (const file of fs.readdirSync(MIGRATIONS)) {
    const src = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    if (!src.includes("change_notice_releases")) continue;
    for (const match of src.matchAll(/"([a-z0-9][a-z0-9-]*-\d{4}-\d{2})"/g)) ids.add(match[1]);
  }
  return ids;
};

describe("change notice releases", () => {
  it("reads the client registry", () => {
    expect(registryIds().length).toBeGreaterThan(0);
  });

  it.each(registryIds())("%s has a release row in a migration", (id) => {
    expect(releasedIds()).toContain(id);
  });
});
