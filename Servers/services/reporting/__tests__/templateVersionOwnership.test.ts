jest.mock("../../../utils/reportTemplate.utils", () => ({
  getTemplateByIdQuery: jest.fn(),
  getVersionByIdQuery: jest.fn(),
}));

import { validateTemplateVersionOwnership } from "../scheduledReportService";
import { getTemplateByIdQuery, getVersionByIdQuery } from "../../../utils/reportTemplate.utils";

beforeEach(() => jest.clearAllMocks());

describe("validateTemplateVersionOwnership", () => {
  it("accepts a version that belongs to the template and the org", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (getVersionByIdQuery as jest.Mock).mockResolvedValue({ id: 30, template_id: 7 });
    await expect(validateTemplateVersionOwnership(7, 30, 42)).resolves.toEqual([]);
    expect(getTemplateByIdQuery).toHaveBeenCalledWith(7, 42);
    expect(getVersionByIdQuery).toHaveBeenCalledWith(30, 42);
  });

  it("rejects a template belonging to another org", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue(null);
    const errs = await validateTemplateVersionOwnership(7, 30, 42);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/templateId/);
  });

  it("rejects a version belonging to another org", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (getVersionByIdQuery as jest.Mock).mockResolvedValue(null);
    const errs = await validateTemplateVersionOwnership(7, 30, 42);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/templateVersionId/);
  });

  it("rejects a version that exists but belongs to a different template", async () => {
    (getTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 7 });
    (getVersionByIdQuery as jest.Mock).mockResolvedValue({ id: 30, template_id: 99 });
    const errs = await validateTemplateVersionOwnership(7, 30, 42);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/does not belong/);
  });

  it("rejects missing ids rather than querying with NaN", async () => {
    const errs = await validateTemplateVersionOwnership(undefined as any, undefined as any, 42);
    expect(errs).toHaveLength(1);
    expect(getTemplateByIdQuery).not.toHaveBeenCalled();
  });
});
