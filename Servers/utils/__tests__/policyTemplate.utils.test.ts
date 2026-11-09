jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import {
  getPolicyTemplatesQuery,
  getPolicyTemplateByIdQuery,
  createPolicyTemplateQuery,
  updatePolicyTemplateQuery,
  deletePolicyTemplateQuery,
  createPolicyTemplateFromPolicyQuery,
} from "../policyTemplate.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const q = sequelize.query as jest.Mock;

describe("policyTemplate.utils", () => {
  beforeEach(() => q.mockReset());

  it("getPolicyTemplatesQuery returns system + org templates", async () => {
    q.mockResolvedValueOnce([{ id: 1, name: "AI Governance Policy" }]);
    const rows = await getPolicyTemplatesQuery(42);
    expect(rows).toHaveLength(1);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organizationId).toBe(42);
    expect(sql).toContain("organization_id IS NULL OR organization_id = :organizationId");
    expect(sql).toContain("is_system_template DESC");
  });

  it("getPolicyTemplateByIdQuery admits system templates (organization_id IS NULL)", async () => {
    q.mockResolvedValueOnce([{ id: 5 }]);
    const row = await getPolicyTemplateByIdQuery(5, 42);
    expect(row.id).toBe(5);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.id).toBe(5);
    expect(sql).toContain("organization_id IS NULL");
  });

  it("getPolicyTemplateByIdQuery returns null when nothing matches", async () => {
    q.mockResolvedValueOnce([]);
    const row = await getPolicyTemplateByIdQuery(99, 42);
    expect(row).toBeNull();
  });

  it("createPolicyTemplateQuery inserts org-scoped, non-system", async () => {
    q.mockResolvedValueOnce([{ id: 7 }]);
    const row = await createPolicyTemplateQuery(
      {
        name: "Vendor AI Policy",
        category: "Legal and compliance",
        content: "<p>x</p>",
        tags: ["Vendor"],
      },
      42,
      9,
    );
    expect(row.id).toBe(7);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organizationId).toBe(42);
    expect(opts.replacements.createdBy).toBe(9);
    // is_system_template is a SQL literal, never a replacement — so a caller
    // cannot set it. Assert the literal, not a bare "false".
    expect(sql).toMatch(/is_system_template[\s\S]*VALUES[\s\S]*false/);
    expect(opts.replacements).not.toHaveProperty("is_system_template");
  });

  it("createPolicyTemplateQuery ignores a caller-supplied is_system_template", async () => {
    q.mockResolvedValueOnce([{ id: 8 }]);
    await createPolicyTemplateQuery(
      { name: "Sneaky", category: "Legal and compliance", is_system_template: true },
      42,
      9,
    );
    const [, opts] = q.mock.calls[0];
    expect(opts.replacements.is_system_template).toBeUndefined();
  });

  it("createPolicyTemplateQuery rejects a missing name", async () => {
    await expect(
      createPolicyTemplateQuery({ category: "Legal and compliance" }, 42, 9),
    ).rejects.toThrow(ValidationException);
    expect(q).not.toHaveBeenCalled();
  });

  it("createPolicyTemplateQuery rejects a missing category", async () => {
    await expect(createPolicyTemplateQuery({ name: "No category" }, 42, 9)).rejects.toThrow(
      ValidationException,
    );
    expect(q).not.toHaveBeenCalled();
  });

  it("createPolicyTemplateQuery rejects a one-character name", async () => {
    await expect(
      createPolicyTemplateQuery({ name: "x", category: "Legal and compliance" }, 42, 9),
    ).rejects.toThrow(ValidationException);
    expect(q).not.toHaveBeenCalled();
  });

  it("createPolicyTemplateQuery maps a unique violation to ConflictException", async () => {
    const dup: any = new Error("duplicate key value violates unique constraint");
    dup.parent = { code: "23505" };
    q.mockRejectedValueOnce(dup);
    await expect(
      createPolicyTemplateQuery({ name: "Dup", category: "Legal and compliance" }, 42, 9),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("updatePolicyTemplateQuery refuses system templates in the WHERE clause", async () => {
    q.mockResolvedValueOnce([[{ id: 7 }], 1]);
    await updatePolicyTemplateQuery(7, 42, { name: "Renamed" });
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.organizationId).toBe(42);
    expect(sql).toContain("is_system_template = false");
    // Not "organization_id IS NULL OR ..." — writes never match a system row.
    expect(sql).not.toContain("organization_id IS NULL");
  });

  it("updatePolicyTemplateQuery 400s with no updatable fields", async () => {
    await expect(updatePolicyTemplateQuery(7, 42, {})).rejects.toThrow(ValidationException);
    expect(q).not.toHaveBeenCalled();
  });

  it("updatePolicyTemplateQuery maps a unique violation to ConflictException", async () => {
    const dup: any = new Error("duplicate key value violates unique constraint");
    dup.parent = { code: "23505" };
    q.mockRejectedValueOnce(dup);
    await expect(updatePolicyTemplateQuery(7, 42, { name: "Dup" })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("deletePolicyTemplateQuery hard-deletes with the org + system guards", async () => {
    q.mockResolvedValueOnce([[{ id: 7 }], 1]);
    const row = await deletePolicyTemplateQuery(7, 42);
    expect(row.id).toBe(7);
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toContain("DELETE FROM policy_templates");
    expect(sql).toContain("is_system_template = false");
    expect(sql).not.toContain("organization_id IS NULL");
    expect(opts.replacements.organizationId).toBe(42);
  });

  it("createPolicyTemplateFromPolicyQuery copies the policy row into the org", async () => {
    q.mockResolvedValueOnce([{ id: 11 }]);
    const row = await createPolicyTemplateFromPolicyQuery(3, 42, 9, "Saved policy");
    expect(row.id).toBe(11);
    const [sql, opts] = q.mock.calls[0];
    expect(opts.replacements.policyId).toBe(3);
    expect(opts.replacements.organizationId).toBe(42);
    expect(opts.replacements.name).toBe("Saved policy");
    expect(sql).toContain("FROM policy_manager");
    expect(sql).toContain("content_html");
    // The source row must belong to the same org.
    expect(sql).toContain("organization_id = :organizationId");
  });

  it("createPolicyTemplateFromPolicyQuery falls back to the policy title as the name", async () => {
    q.mockResolvedValueOnce([{ id: 12 }]);
    await createPolicyTemplateFromPolicyQuery(3, 42, 9);
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toContain("COALESCE(:name, title)");
    expect(opts.replacements.name).toBeNull();
  });
});
