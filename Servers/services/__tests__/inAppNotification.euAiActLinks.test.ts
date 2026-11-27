/**
 * Links to EU AI Act items: a use case's EU AI Act opens on its project page,
 * EU AI Act (organization) on the Frameworks page, and a use case's hidden row
 * of an item that moved to EU AI Act (organization) opens the organizational
 * project's row of that item (or nothing, when there is none).
 */
const mockQuery = jest.fn();

jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: { publish: jest.fn().mockResolvedValue(1) },
}));

import {
  buildEntityUrlAsync,
  euAiActLinkTarget,
  euAiActLocation,
} from "../inAppNotification.service";

const BASE = "https://app.example";
const USE_CASE = { project_id: 12, framework_id: 1 };
const ORGANIZATION = { project_id: 30, framework_id: 29 };

const visible = (row: object) => ({
  ...row,
  hidden: false,
  org_project_id: null,
  org_framework_id: null,
});
const hidden = (row: object, org: boolean) => ({
  ...USE_CASE,
  ...row,
  hidden: true,
  org_project_id: org ? ORGANIZATION.project_id : null,
  org_framework_id: org ? ORGANIZATION.framework_id : null,
});

beforeEach(() => mockQuery.mockReset());

describe("euAiActLocation", () => {
  it("opens a use case's EU AI Act on its project page", () => {
    expect(euAiActLocation(BASE, USE_CASE)).toBe(
      `${BASE}/project-view?projectId=12&tab=frameworks&framework=eu-ai-act`,
    );
  });

  it("opens EU AI Act (organization) on the Frameworks page", () => {
    expect(euAiActLocation(BASE, { project_id: 30, framework_id: "29" as any })).toBe(
      `${BASE}/framework?framework=eu-ai-act-organization`,
    );
  });
});

describe("euAiActLinkTarget", () => {
  it("keeps a visible row's own ids", () => {
    expect(euAiActLinkTarget(BASE, visible(USE_CASE), { controlId: 4 }, { controlId: 9 })).toEqual({
      location: euAiActLocation(BASE, USE_CASE),
      ids: { controlId: 4 },
    });
  });

  it("sends a hidden row to the organizational row", () => {
    expect(euAiActLinkTarget(BASE, hidden({}, true), { controlId: 4 }, { controlId: 9 })).toEqual({
      location: `${BASE}/framework?framework=eu-ai-act-organization`,
      ids: { controlId: 9 },
    });
  });

  it("gives nothing for a hidden row without an organizational counterpart", () => {
    expect(euAiActLinkTarget(BASE, hidden({}, false), { controlId: 4 }, { controlId: null })).toBe(
      null,
    );
    expect(euAiActLinkTarget(BASE, hidden({}, true), { a: 1, b: 2 }, { a: 9, b: null })).toBeNull();
  });
});

describe("buildEntityUrlAsync for EU AI Act items", () => {
  const url = (entityType: string, entityId: number) =>
    buildEntityUrlAsync(BASE, entityType, entityId, 1);

  it("links a control of either framework, hidden ones to the organizational row", async () => {
    mockQuery.mockResolvedValueOnce([visible({ ...USE_CASE, org_control_id: null })]);
    expect(await url("eu_control", 4)).toBe(
      `${BASE}/project-view?projectId=12&tab=frameworks&framework=eu-ai-act&subtab=compliance&controlId=4`,
    );

    mockQuery.mockResolvedValueOnce([visible({ ...ORGANIZATION, org_control_id: null })]);
    expect(await url("eu_control", 9)).toBe(
      `${BASE}/framework?framework=eu-ai-act-organization&subtab=compliance&controlId=9`,
    );

    mockQuery.mockResolvedValueOnce([hidden({ org_control_id: 9 }, true)]);
    expect(await url("eu_control", 4)).toBe(
      `${BASE}/framework?framework=eu-ai-act-organization&subtab=compliance&controlId=9`,
    );

    mockQuery.mockResolvedValueOnce([hidden({ org_control_id: null }, false)]);
    expect(await url("eu_control", 4)).toBeNull();

    // The query tells hidden rows apart with the shared struct rule and is
    // scoped to the organization.
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain(
      "NOT (COALESCE(cs.moved_to_framework_id, 1) = pf.framework_id) AS hidden",
    );
    expect(sql).toContain("opf.framework_id = cs.moved_to_framework_id");
    expect(sql).toContain("oc.control_meta_id = c.control_meta_id");
    expect(options.replacements).toEqual({ organizationId: 1, entityId: 4 });
  });

  it("links a hidden subcontrol to the organizational control and subcontrol", async () => {
    mockQuery.mockResolvedValueOnce([
      hidden({ control_id: 4, org_control_id: 9, org_subcontrol_id: 91 }, true),
    ]);
    expect(await url("eu_subcontrol", 41)).toBe(
      `${BASE}/framework?framework=eu-ai-act-organization&subtab=compliance&controlId=9&subControlId=91`,
    );

    mockQuery.mockResolvedValueOnce([
      visible({ ...USE_CASE, control_id: 4, org_control_id: null, org_subcontrol_id: null }),
    ]);
    expect(await url("eu_subcontrol", 41)).toBe(
      `${BASE}/project-view?projectId=12&tab=frameworks&framework=eu-ai-act&subtab=compliance&controlId=4&subControlId=41`,
    );

    mockQuery.mockResolvedValueOnce([
      hidden({ control_id: 4, org_control_id: null, org_subcontrol_id: null }, false),
    ]);
    expect(await url("eu_subcontrol", 41)).toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain("s2.subcontrol_meta_id = sc.subcontrol_meta_id");
  });

  it("links a hidden answer to the organizational assessment", async () => {
    mockQuery.mockResolvedValueOnce([
      hidden({ question_id: 77, topic_id: 8, org_answer_id: 501 }, true),
    ]);
    expect(await url("eu_assessment", 300)).toBe(
      `${BASE}/framework?framework=eu-ai-act-organization&subtab=assessment&topicId=8&questionId=77`,
    );

    mockQuery.mockResolvedValueOnce([
      hidden({ question_id: 77, topic_id: 8, org_answer_id: null }, true),
    ]);
    expect(await url("eu_assessment", 300)).toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain(
      "NOT (COALESCE(q.moved_to_framework_id, 1) = pf.framework_id) AS hidden",
    );
  });
});
