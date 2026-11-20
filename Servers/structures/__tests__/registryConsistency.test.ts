import { getAttributes } from "sequelize-typescript";
import { FRAMEWORK_STRUCTURES } from "../index";
import { NotesAttachedToEnum } from "../../domain.layer/models/notes/notes.model";
import { FileModel } from "../../domain.layer/models/file/file.model";

// file.model imports utils that open the app's Sequelize instance; no DB is needed here.
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

// FileSource is a type-only union, so the runtime list is the ENUM on files.source.
const FILE_SOURCES: string[] = getAttributes(FileModel.prototype).source.type.values;
const NOTE_TARGETS = Object.values(NotesAttachedToEnum) as string[];

describe("framework registry labels", () => {
  it("reads the files.source ENUM values", () => {
    expect(FILE_SOURCES.length).toBeGreaterThan(0);
  });

  describe.each(FRAMEWORK_STRUCTURES.map((fw) => [fw.key, fw] as const))("%s", (_key, fw) => {
    const entityTypes = Object.values(fw.entity_types).filter(Boolean) as string[];

    it("has a notes target for every entity type", () => {
      for (const entityType of entityTypes) {
        expect(NOTE_TARGETS).toContain(`${fw.framework_type}_${entityType}`.toUpperCase());
      }
    });

    it("has a file source label for every entity type, each one a files.source value", () => {
      for (const entityType of entityTypes) {
        expect(fw.source_labels[entityType]).toBeDefined();
      }
      for (const label of Object.values(fw.source_labels)) {
        expect(FILE_SOURCES).toContain(label);
      }
    });
  });
});
