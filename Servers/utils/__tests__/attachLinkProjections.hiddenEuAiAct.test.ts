/**
 * The File Manager does not show a file's links to the EU AI Act rows a use
 * case still has for items that moved to EU AI Act (organization): those rows
 * are hidden, and their work was copied to the organizational project.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import { attachLinkProjections, HIDDEN_EU_AI_ACT_LINK_SQL } from "../files/attachLinkProjections";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<unknown>>;

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([[], 0]);
});

describe("attachLinkProjections and hidden EU AI Act rows", () => {
  it("leaves out links to hidden subcontrols and answers", async () => {
    await attachLinkProjections(4, [{ id: 1 }]);

    const [sql, options] = mockQuery.mock.calls[0] as [string, any];
    expect(sql).toContain("FROM file_entity_links fel");
    expect(sql).toContain(`AND NOT (${HIDDEN_EU_AI_ACT_LINK_SQL})`);
    expect(options.replacements).toEqual({ organizationId: 4, fileIds: [1] });
  });

  it("tells hidden rows apart with the shared struct rule, per framework", () => {
    expect(HIDDEN_EU_AI_ACT_LINK_SQL).toContain("fel.framework_type = 'eu_ai_act'");
    expect(HIDDEN_EU_AI_ACT_LINK_SQL).toContain("fel.entity_type = 'subcontrol' AND EXISTS");
    expect(HIDDEN_EU_AI_ACT_LINK_SQL).toContain(
      "NOT (COALESCE(cs.moved_to_framework_id, 1) = pf.framework_id)",
    );
    expect(HIDDEN_EU_AI_ACT_LINK_SQL).toContain("fel.entity_type = 'assessment' AND EXISTS");
    expect(HIDDEN_EU_AI_ACT_LINK_SQL).toContain(
      "NOT (COALESCE(q.moved_to_framework_id, 1) = pf.framework_id)",
    );
    // Rows are matched within the link's organization.
    expect(HIDDEN_EU_AI_ACT_LINK_SQL).toContain("s.organization_id = fel.organization_id");
    expect(HIDDEN_EU_AI_ACT_LINK_SQL).toContain("ans.organization_id = fel.organization_id");
  });
});
