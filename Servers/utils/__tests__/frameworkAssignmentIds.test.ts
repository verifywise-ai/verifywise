/**
 * The owner / reviewer / approver write path for every framework that has one.
 *
 * These three fields arrive as form-data strings and are parsed before they are
 * written. The parse used to be `parseInt`, which returns a numeric PREFIX — so
 * an owner of "3abc" was written as user 3 and the record was assigned to
 * somebody the caller never named. The guard beside it (`if (isNaN) return acc`)
 * could not catch that, because 3 is not NaN.
 *
 * Both builders drop an unparseable field from the SET clause rather than
 * failing the request, so the assertion is that the column is absent from the
 * generated UPDATE while its siblings still land.
 */
import { sequelize } from "../../database/db";
import { updateSubClauseQuery, updateAnnexControlQuery } from "../iso27001.utils";
import {
  updateSubClauseQuery as updateSubClauseQuery42001,
  updateAnnexCategoryQuery,
} from "../iso42001.utils";
import { updateSubcategoryQuery } from "../nistAiRmfCorrect.utils";
import { updateNISTAIRMFSubcategoryByIdQuery } from "../nist_ai_rmf.subcategory.utils";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../files/evidenceFiles.utils", () => ({
  getEvidenceFilesForEntity: jest.fn().mockResolvedValue([]),
  getEvidenceFilesForEntities: jest.fn().mockResolvedValue([]),
  deleteAllFileEntityLinksForEntities: jest.fn().mockResolvedValue(undefined),
}));

const mockQuery = sequelize.query as jest.Mock;

/** The UPDATE the builder produced, plus the values it bound. */
const updateCall = () => {
  const call = mockQuery.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE"));
  if (!call) throw new Error("no UPDATE was issued");
  return { sql: String(call[0]) as string, replacements: call[1].replacements as any };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[{ id: 1 }], 1]);
});

describe.each([
  ["ISO 27001 subclause", updateSubClauseQuery, "null"],
  ["ISO 27001 annex control", updateAnnexControlQuery, "null"],
  ["ISO 42001 subclause", updateSubClauseQuery42001, "null"],
  ["ISO 42001 annex category", updateAnnexCategoryQuery, "null"],
  ["NIST AI RMF subcategory", updateNISTAIRMFSubcategoryByIdQuery, "null"],
  // The alt builder drops an empty owner from the SET clause instead of
  // nulling it — a pre-existing divergence between the two NIST builders,
  // recorded here rather than smoothed over.
  ["NIST AI RMF subcategory (alt builder)", updateSubcategoryQuery, "drop"],
])("%s assignment ids", (_label, update: any, onEmpty) => {
  it.each(["3abc", "3.9", "3e0", "+3", " 3x"])(
    "drops an owner of %p instead of assigning user 3",
    async (junk) => {
      await update(1, { owner: junk, status: "In progress" } as any, [], [], 1, {} as any);

      const { sql, replacements } = updateCall();
      expect(sql).not.toContain("owner");
      expect(replacements.owner).toBeUndefined();
      // The rest of the payload still lands — one junk field is dropped, the
      // whole update is not abandoned.
      expect(sql).toContain("status");
      expect(replacements.status).toBe("In progress");
    },
  );

  it("still writes a clean numeric string, which is what the form sends", async () => {
    await update(1, { owner: "3", reviewer: 4 } as any, [], [], 1, {} as any);

    const { sql, replacements } = updateCall();
    expect(sql).toContain("owner");
    expect(replacements.owner).toBe(3);
    expect(replacements.reviewer).toBe(4);
  });

  it(`handles an empty-string owner (${onEmpty}) — unchanged by this fix`, async () => {
    await update(1, { owner: "", status: "In progress" } as any, [], [], 1, {} as any);

    const { sql, replacements } = updateCall();
    if (onEmpty === "null") {
      expect(replacements.owner).toBeNull();
    } else {
      expect(sql).not.toContain("owner");
      expect(replacements.owner).toBeUndefined();
    }
  });
});
