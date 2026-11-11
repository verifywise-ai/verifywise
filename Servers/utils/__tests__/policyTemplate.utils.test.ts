jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import {
  getPolicyTemplatesQuery,
  getPolicyTemplateByIdQuery,
  createPolicyTemplateQuery,
  updatePolicyTemplateQuery,
  deletePolicyTemplateQuery,
  createPolicyTemplateFromPolicyQuery,
  POLICY_TEMPLATE_DEFAULT_CATEGORY,
} from "../policyTemplate.utils";
import {
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

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
    // QueryTypes.DELETE resolves to the RETURNING rows themselves.
    q.mockResolvedValueOnce([{ id: 7 }]);
    const row = await deletePolicyTemplateQuery(7, 42);
    expect(row.id).toBe(7);
    const [sql, opts] = q.mock.calls[0];
    expect(sql).toContain("DELETE FROM policy_templates");
    expect(sql).toContain("is_system_template = false");
    expect(sql).not.toContain("organization_id IS NULL");
    expect(opts.replacements.organizationId).toBe(42);
  });

  it("deletePolicyTemplateQuery returns null when no row matched", async () => {
    q.mockResolvedValueOnce([]);
    expect(await deletePolicyTemplateQuery(7, 42)).toBeNull();
  });

  describe("updatePolicyTemplateQuery tags and is_active", () => {
    it("binds tags as a text[] array, not a bare comma list", async () => {
      q.mockResolvedValueOnce([[{ id: 7 }], 1]);
      await updatePolicyTemplateQuery(7, 42, { tags: [" Vendor ", "Privacy", "Vendor"] });
      const [sql, opts] = q.mock.calls[0];
      expect(sql).toContain("tags = ARRAY[:tags]::text[]");
      expect(sql).not.toMatch(/tags = :tags/);
      // Trimmed and de-duplicated.
      expect(opts.replacements.tags).toEqual(["Vendor", "Privacy"]);
    });

    it("writes the empty-array literal for an empty tag list", async () => {
      q.mockResolvedValueOnce([[{ id: 7 }], 1]);
      await updatePolicyTemplateQuery(7, 42, { tags: [] });
      const [sql] = q.mock.calls[0];
      expect(sql).toContain("tags = '{}'::text[]");
    });

    it.each([["not-an-array"], [[1, 2]], [[{ a: 1 }]], [null]])(
      "rejects tags %p with a ValidationException",
      async (tags) => {
        await expect(updatePolicyTemplateQuery(7, 42, { tags })).rejects.toThrow(
          ValidationException,
        );
        expect(q).not.toHaveBeenCalled();
      },
    );

    it("rejects an over-long tag", async () => {
      await expect(updatePolicyTemplateQuery(7, 42, { tags: ["x".repeat(101)] })).rejects.toThrow(
        ValidationException,
      );
      expect(q).not.toHaveBeenCalled();
    });

    it("rejects too many tags", async () => {
      const tags = Array.from({ length: 51 }, (_, i) => `t${i}`);
      await expect(updatePolicyTemplateQuery(7, 42, { tags })).rejects.toThrow(ValidationException);
    });

    it("accepts a boolean is_active", async () => {
      q.mockResolvedValueOnce([[{ id: 7 }], 1]);
      await updatePolicyTemplateQuery(7, 42, { is_active: false });
      const [sql, opts] = q.mock.calls[0];
      expect(sql).toContain("is_active = :is_active");
      expect(opts.replacements.is_active).toBe(false);
    });

    it.each([["false"], [0], [null]])("rejects is_active %p", async (value) => {
      await expect(updatePolicyTemplateQuery(7, 42, { is_active: value })).rejects.toThrow(
        ValidationException,
      );
      expect(q).not.toHaveBeenCalled();
    });

    it("rejects non-string content", async () => {
      await expect(updatePolicyTemplateQuery(7, 42, { content: 5 })).rejects.toThrow(
        ValidationException,
      );
    });

    it("sanitizes updated content", async () => {
      q.mockResolvedValueOnce([[{ id: 7 }], 1]);
      await updatePolicyTemplateQuery(7, 42, {
        content: '<p>ok</p><script>alert(1)</script><img src="x" onerror="alert(1)">',
      });
      const [, opts] = q.mock.calls[0];
      expect(opts.replacements.content).toContain("<p>ok</p>");
      expect(opts.replacements.content).not.toContain("<script");
      expect(opts.replacements.content).not.toContain("onerror");
    });
  });

  it("createPolicyTemplateQuery validates tags the same way", async () => {
    await expect(
      createPolicyTemplateQuery(
        { name: "Bad tags", category: "Legal and compliance", tags: "Vendor" },
        42,
        9,
      ),
    ).rejects.toThrow(ValidationException);
    expect(q).not.toHaveBeenCalled();
  });

  it("createPolicyTemplateQuery writes the empty literal when there are no tags", async () => {
    q.mockResolvedValueOnce([{ id: 7 }]);
    await createPolicyTemplateQuery({ name: "No tags", category: "Legal and compliance" }, 42, 9);
    const [sql] = q.mock.calls[0];
    expect(sql).toContain("'{}'::text[]");
  });

  describe("description validation", () => {
    const base = { name: "Vendor AI Policy", category: "Legal and compliance" };

    it.each([5, ["a", "b"], { x: 1 }, true])(
      "createPolicyTemplateQuery rejects a non-string description (%p)",
      async (description) => {
        await expect(createPolicyTemplateQuery({ ...base, description }, 42, 9)).rejects.toThrow(
          ValidationException,
        );
        expect(q).not.toHaveBeenCalled();
      },
    );

    it("createPolicyTemplateQuery rejects an over-long description", async () => {
      await expect(
        createPolicyTemplateQuery({ ...base, description: "d".repeat(2001) }, 42, 9),
      ).rejects.toThrow(ValidationException);
      expect(q).not.toHaveBeenCalled();
    });

    it("createPolicyTemplateQuery stores a string description and null when absent", async () => {
      q.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([{ id: 8 }]);
      await createPolicyTemplateQuery({ ...base, description: "d".repeat(2000) }, 42, 9);
      await createPolicyTemplateQuery(base, 42, 9);
      expect(q.mock.calls[0][1].replacements.description).toBe("d".repeat(2000));
      expect(q.mock.calls[1][1].replacements.description).toBeNull();
    });

    it.each([5, ["a"], { x: 1 }, "d".repeat(2001)])(
      "updatePolicyTemplateQuery rejects an invalid description (%p)",
      async (description) => {
        await expect(updatePolicyTemplateQuery(7, 42, { description })).rejects.toThrow(
          ValidationException,
        );
        expect(q).not.toHaveBeenCalled();
      },
    );

    it("updatePolicyTemplateQuery accepts a string or null description", async () => {
      q.mockResolvedValueOnce([[{ id: 7 }], 1]).mockResolvedValueOnce([[{ id: 7 }], 1]);
      await updatePolicyTemplateQuery(7, 42, { description: "New summary" });
      await updatePolicyTemplateQuery(7, 42, { description: null });
      expect(q.mock.calls[0][1].replacements.description).toBe("New summary");
      expect(q.mock.calls[0][0]).toContain("description = :description");
      expect(q.mock.calls[1][1].replacements.description).toBeNull();
    });
  });

  it("rejects a category longer than the column allows", async () => {
    await expect(
      createPolicyTemplateQuery({ name: "Long category", category: "c".repeat(101) }, 42, 9),
    ).rejects.toThrow(ValidationException);
  });

  describe("createPolicyTemplateFromPolicyQuery", () => {
    it("reads the policy in the caller's org, then inserts an org-owned copy", async () => {
      q.mockResolvedValueOnce([{ title: "Source", content_html: "<p>x</p>", tags: ["Vendor"] }]);
      q.mockResolvedValueOnce([{ id: 11 }]);
      const row = await createPolicyTemplateFromPolicyQuery(3, 42, 9, "Saved policy");
      expect(row.id).toBe(11);
      const [selectSql, selectOpts] = q.mock.calls[0];
      expect(selectSql).toContain("FROM policy_manager");
      expect(selectSql).toContain("organization_id = :organizationId");
      expect(selectOpts.replacements).toEqual({ policyId: 3, organizationId: 42 });
      const [insertSql, insertOpts] = q.mock.calls[1];
      expect(insertSql).toContain("INSERT INTO policy_templates");
      expect(insertSql).toContain("ARRAY[:tags]::text[]");
      expect(insertSql).toMatch(/VALUES[\s\S]*false, true/);
      expect(insertOpts.replacements.name).toBe("Saved policy");
      expect(insertOpts.replacements.organizationId).toBe(42);
      expect(insertOpts.replacements.tags).toEqual(["Vendor"]);
    });

    it("falls back to the policy title as the name", async () => {
      q.mockResolvedValueOnce([{ title: "Source title", content_html: "", tags: [] }]);
      q.mockResolvedValueOnce([{ id: 12 }]);
      await createPolicyTemplateFromPolicyQuery(3, 42, 9);
      const [, opts] = q.mock.calls[1];
      expect(opts.replacements.name).toBe("Source title");
    });

    it("uses the chosen category, or a curated default", async () => {
      q.mockResolvedValueOnce([{ title: "A policy", content_html: "", tags: [] }]);
      q.mockResolvedValueOnce([{ id: 13 }]);
      await createPolicyTemplateFromPolicyQuery(3, 42, 9, undefined, "Legal and compliance");
      expect(q.mock.calls[1][1].replacements.category).toBe("Legal and compliance");

      q.mockResolvedValueOnce([{ title: "A policy", content_html: "", tags: [] }]);
      q.mockResolvedValueOnce([{ id: 14 }]);
      await createPolicyTemplateFromPolicyQuery(3, 42, 9);
      expect(q.mock.calls[3][1].replacements.category).toBe(POLICY_TEMPLATE_DEFAULT_CATEGORY);
      expect(POLICY_TEMPLATE_DEFAULT_CATEGORY).toBe("Core AI governance policies");
    });

    it("sanitizes the copied content_html", async () => {
      q.mockResolvedValueOnce([
        {
          title: "Dirty",
          content_html: '<p>keep</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
          tags: [],
        },
      ]);
      q.mockResolvedValueOnce([{ id: 15 }]);
      await createPolicyTemplateFromPolicyQuery(3, 42, 9);
      const content = q.mock.calls[1][1].replacements.content;
      expect(content).toContain("<p>keep</p>");
      expect(content).not.toContain("<script");
      expect(content).not.toContain("javascript:");
    });

    it("coalesces NULL tags and content_html so NOT NULL columns hold", async () => {
      // The SELECT coalesces in SQL; also guard the JS side against a driver
      // that hands back null anyway.
      q.mockResolvedValueOnce([{ title: "Bare policy", content_html: null, tags: null }]);
      q.mockResolvedValueOnce([{ id: 16 }]);
      await createPolicyTemplateFromPolicyQuery(3, 42, 9);
      const [selectSql] = q.mock.calls[0];
      expect(selectSql).toContain("COALESCE(content_html, '')");
      expect(selectSql).toContain("COALESCE(tags, '{}')");
      const [insertSql, insertOpts] = q.mock.calls[1];
      expect(insertSql).toContain("'{}'::text[]");
      expect(insertOpts.replacements.content).toBe("");
      expect(insertOpts.replacements.tags).toEqual([]);
    });

    it("throws NotFoundException when the policy is not in the org", async () => {
      q.mockResolvedValueOnce([]);
      await expect(createPolicyTemplateFromPolicyQuery(3, 42, 9)).rejects.toThrow(
        NotFoundException,
      );
      expect(q).toHaveBeenCalledTimes(1);
    });

    it("maps a unique violation on insert to ConflictException", async () => {
      const dup: any = new Error("duplicate key value violates unique constraint");
      dup.parent = { code: "23505" };
      q.mockResolvedValueOnce([{ title: "Dup", content_html: "", tags: [] }]);
      q.mockRejectedValueOnce(dup);
      await expect(createPolicyTemplateFromPolicyQuery(3, 42, 9)).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });
});
