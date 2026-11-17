/**
 * toolBridge — decision 7 at dispatch: a tool call that names a use case
 * (project_id, projectId, use_case_id) runs only when the calling user may
 * open that use case; otherwise the tool is not called and the model gets the
 * refusal. Tools that name no use case run as before.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../functions/useCaseScope", () => ({
  assertCanReadUseCase: jest.fn(),
}));

import { bridgeTools } from "../toolBridge";
import { assertCanReadUseCase } from "../functions/useCaseScope";

const assertRead = assertCanReadUseCase as unknown as jest.Mock<(...args: any[]) => Promise<void>>;

const def = (name: string, properties: Record<string, unknown>) => ({
  type: "function",
  function: { name, description: name, parameters: { type: "object", properties } },
});

const ORG = 4;
const USER = 9;

function bridged(name: string, properties: Record<string, unknown>) {
  const fn = jest.fn<(...args: any[]) => Promise<unknown>>().mockResolvedValue({ ok: true });
  const tools = bridgeTools([def(name, properties)], { [name]: fn }, ORG, USER);
  const tool = tools[name] as unknown as { execute: (p: Record<string, unknown>) => Promise<any> };
  return { fn, run: (params: Record<string, unknown>) => tool.execute(params) };
}

beforeEach(() => {
  jest.clearAllMocks();
  assertRead.mockResolvedValue(undefined);
});

describe("toolBridge checks the use case a tool names", () => {
  it.each(["project_id", "projectId", "use_case_id"])(
    "refuses %s of a use case the user cannot open, without calling the tool",
    async (param) => {
      assertRead.mockRejectedValue(new Error("You do not have access to use case 12"));
      const { fn, run } = bridged("get_something", { [param]: { type: "number" } });

      const result = await run({ [param]: 12 });

      expect(assertRead).toHaveBeenCalledWith(expect.objectContaining({ _userId: USER }), 12, ORG);
      expect(result).toEqual({ error: "You do not have access to use case 12" });
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it("calls the tool when the user may open the use case", async () => {
    const { fn, run } = bridged("get_something", { project_id: { type: "number" } });

    const result = await run({ project_id: 12 });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it("leaves a tool that names no use case alone", async () => {
    const { fn, run } = bridged("get_org_summary", { limit: { type: "number" } });

    await run({ limit: 5 });

    expect(assertRead).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not check a use case id the model left empty", async () => {
    const { fn, run } = bridged("get_something", { project_id: { type: "number" } });

    await run({ project_id: 0 });

    expect(assertRead).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
