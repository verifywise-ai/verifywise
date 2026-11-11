jest.mock("../../utils/policyTemplate.utils", () => ({
  getPolicyTemplatesQuery: jest.fn(),
  getPolicyTemplateByIdQuery: jest.fn(),
  createPolicyTemplateQuery: jest.fn(),
  updatePolicyTemplateQuery: jest.fn(),
  deletePolicyTemplateQuery: jest.fn(),
  createPolicyTemplateFromPolicyQuery: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));

import {
  listPolicyTemplates,
  getPolicyTemplate,
  createPolicyTemplate,
  updatePolicyTemplate,
  deletePolicyTemplate,
  createPolicyTemplateFromPolicy,
} from "../policyTemplate.ctrl";
import {
  getPolicyTemplatesQuery,
  getPolicyTemplateByIdQuery,
  createPolicyTemplateQuery,
  updatePolicyTemplateQuery,
  deletePolicyTemplateQuery,
  createPolicyTemplateFromPolicyQuery,
} from "../../utils/policyTemplate.utils";
import {
  ValidationException,
  NotFoundException,
} from "../../domain.layer/exceptions/custom.exception";

function mockRes() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}
const mockReq = (over: any = {}) => ({
  organizationId: 42,
  userId: 9,
  params: {},
  body: {},
  t: (s: string) => s,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("listPolicyTemplates", () => {
  it("200s with the org-scoped template list", async () => {
    (getPolicyTemplatesQuery as jest.Mock).mockResolvedValue([{ id: 1 }]);
    const res = mockRes();
    await listPolicyTemplates(mockReq() as any, res);
    expect(getPolicyTemplatesQuery).toHaveBeenCalledWith(42);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("getPolicyTemplate", () => {
  it("404s when the template is not visible to the org", async () => {
    (getPolicyTemplateByIdQuery as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await getPolicyTemplate(mockReq({ params: { id: "1" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200s with the template", async () => {
    (getPolicyTemplateByIdQuery as jest.Mock).mockResolvedValue({ id: 1 });
    const res = mockRes();
    await getPolicyTemplate(mockReq({ params: { id: "1" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("createPolicyTemplate", () => {
  it("201s with the created template", async () => {
    (createPolicyTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    const res = mockRes();
    await createPolicyTemplate(
      mockReq({ body: { name: "Vendor AI Policy", category: "Legal and compliance" } }) as any,
      res,
    );
    expect(createPolicyTemplateQuery).toHaveBeenCalledWith(expect.any(Object), 42, 9);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("maps a ValidationException to 400, not 500", async () => {
    (createPolicyTemplateQuery as jest.Mock).mockRejectedValue(
      new ValidationException("name is required", "name", undefined),
    );
    const res = mockRes();
    await createPolicyTemplate(mockReq({ body: {} }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps a unique-violation to 409", async () => {
    const dup: any = new Error("duplicate key value violates unique constraint");
    dup.parent = { code: "23505" };
    (createPolicyTemplateQuery as jest.Mock).mockRejectedValue(dup);
    const res = mockRes();
    await createPolicyTemplate(
      mockReq({ body: { name: "Dup", category: "Legal and compliance" } }) as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("updatePolicyTemplate", () => {
  it("400s when no updatable fields are supplied", async () => {
    const res = mockRes();
    await updatePolicyTemplate(mockReq({ params: { id: "7" }, body: {} }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(updatePolicyTemplateQuery).not.toHaveBeenCalled();
  });

  it("404s when the row does not match the org (or is a system template)", async () => {
    (updatePolicyTemplateQuery as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await updatePolicyTemplate(mockReq({ params: { id: "1" }, body: { name: "x" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("200s with the updated template", async () => {
    (updatePolicyTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    const res = mockRes();
    await updatePolicyTemplate(
      mockReq({ params: { id: "7" }, body: { name: "Renamed" } }) as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("maps a NotFoundException from the utils layer to 404", async () => {
    (updatePolicyTemplateQuery as jest.Mock).mockRejectedValue(
      new NotFoundException("not found", "policy_template", 7),
    );
    const res = mockRes();
    await updatePolicyTemplate(mockReq({ params: { id: "7" }, body: { name: "x" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("deletePolicyTemplate", () => {
  it("202s on delete", async () => {
    (deletePolicyTemplateQuery as jest.Mock).mockResolvedValue({ id: 7 });
    const res = mockRes();
    await deletePolicyTemplate(mockReq({ params: { id: "7" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("404s when the template is a system template or belongs to another org", async () => {
    (deletePolicyTemplateQuery as jest.Mock).mockResolvedValue(null);
    const res = mockRes();
    await deletePolicyTemplate(mockReq({ params: { id: "1" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("createPolicyTemplateFromPolicy", () => {
  it("400s without a numeric policy_id", async () => {
    const res = mockRes();
    await createPolicyTemplateFromPolicy(mockReq({ body: {} }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createPolicyTemplateFromPolicyQuery).not.toHaveBeenCalled();
  });

  it("201s and passes the optional name through", async () => {
    (createPolicyTemplateFromPolicyQuery as jest.Mock).mockResolvedValue({ id: 11 });
    const res = mockRes();
    await createPolicyTemplateFromPolicy(
      mockReq({ body: { policy_id: 3, name: "Saved" } }) as any,
      res,
    );
    expect(createPolicyTemplateFromPolicyQuery).toHaveBeenCalledWith(3, 42, 9, "Saved", undefined);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("404s when the policy is not in the org", async () => {
    (createPolicyTemplateFromPolicyQuery as jest.Mock).mockRejectedValue(
      new NotFoundException("policy not found", "policy_manager", 3),
    );
    const res = mockRes();
    await createPolicyTemplateFromPolicy(mockReq({ body: { policy_id: 3 } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("passes the chosen category through", async () => {
    (createPolicyTemplateFromPolicyQuery as jest.Mock).mockResolvedValue({ id: 12 });
    const res = mockRes();
    await createPolicyTemplateFromPolicy(
      mockReq({ body: { policy_id: 3, category: "Legal and compliance" } }) as any,
      res,
    );
    expect(createPolicyTemplateFromPolicyQuery).toHaveBeenCalledWith(
      3,
      42,
      9,
      undefined,
      "Legal and compliance",
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("maps a ValidationException (bad name) to 400", async () => {
    (createPolicyTemplateFromPolicyQuery as jest.Mock).mockRejectedValue(
      new ValidationException("name must be a string between 2 and 255 characters", "name", "x"),
    );
    const res = mockRes();
    await createPolicyTemplateFromPolicy(
      mockReq({ body: { policy_id: 3, name: "x" } }) as any,
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("non-numeric template ids", () => {
  const badIds = ["abc", "1.5", "-3", "0", "9007199254740993", ""];

  it.each(badIds)("getPolicyTemplate 400s for id %p without querying", async (id) => {
    const res = mockRes();
    await getPolicyTemplate(mockReq({ params: { id } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(getPolicyTemplateByIdQuery).not.toHaveBeenCalled();
  });

  it.each(badIds)("updatePolicyTemplate 400s for id %p without querying", async (id) => {
    const res = mockRes();
    await updatePolicyTemplate(mockReq({ params: { id }, body: { name: "Renamed" } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(updatePolicyTemplateQuery).not.toHaveBeenCalled();
  });

  it.each(badIds)("deletePolicyTemplate 400s for id %p without querying", async (id) => {
    const res = mockRes();
    await deletePolicyTemplate(mockReq({ params: { id } }) as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(deletePolicyTemplateQuery).not.toHaveBeenCalled();
  });
});
