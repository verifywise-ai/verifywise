/**
 * toolBridge — decision 7 at dispatch: every tool call goes through
 * useCaseRefusalForTool once (its rules are tested in
 * useCaseScope.tool.test.ts). A refused call never reaches the tool and the
 * model gets the refusal; write tools are checked with the write rule.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../functions/useCaseScope", () => ({
  useCaseRefusalForTool: jest.fn(),
}));

import { bridgeTools } from "../toolBridge";
import { useCaseRefusalForTool } from "../functions/useCaseScope";
import { writeToolExecutors } from "../confirmation/createWriteTool";

const refusalFor = useCaseRefusalForTool as unknown as jest.Mock<
  (...args: any[]) => Promise<string | null>
>;

const ORG = 4;
const USER = 9;

function bridged(name: string) {
  const fn = jest.fn<(...args: any[]) => Promise<unknown>>().mockResolvedValue({ ok: true });
  const def = {
    type: "function",
    function: {
      name,
      description: name,
      parameters: { type: "object", properties: { project_id: { type: "number" } } },
    },
  };
  const tools = bridgeTools([def], { [name]: fn }, ORG, USER);
  const tool = tools[name] as unknown as { execute: (p: Record<string, unknown>) => Promise<any> };
  return { fn, run: (params: Record<string, unknown>) => tool.execute(params) };
}

beforeEach(() => {
  jest.clearAllMocks();
  refusalFor.mockResolvedValue(null);
});

describe("toolBridge checks the use cases a tool call names", () => {
  it("returns the refusal without calling the tool", async () => {
    refusalFor.mockResolvedValue("You do not have access to use case 12");
    const { fn, run } = bridged("get_something");

    const result = await run({ project_id: 12 });

    expect(result).toEqual({ error: "You do not have access to use case 12" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("checks a read tool with the read rule, as the calling user", async () => {
    const { fn, run } = bridged("get_something");

    await run({ project_id: 12 });

    expect(refusalFor).toHaveBeenCalledWith(
      "get_something",
      expect.objectContaining({ project_id: 12, _userId: USER }),
      ORG,
      false,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("checks a write tool with the write rule", async () => {
    writeToolExecutors.set("agent_do_something", async () => ({}));
    const { run } = bridged("agent_do_something");

    await run({ project_id: 12 });

    expect(refusalFor).toHaveBeenCalledWith("agent_do_something", expect.anything(), ORG, true);
    writeToolExecutors.delete("agent_do_something");
  });
});
