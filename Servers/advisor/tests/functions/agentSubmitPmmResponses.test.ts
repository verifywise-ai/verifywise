import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/postMarketMonitoring.utils", () => ({
  savePMMResponsesQuery: jest.fn(),
}));
jest.mock("../../../utils/pmmUseCaseAccess.utils", () => ({
  questionsBelongToPmmCycleQuery: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import * as pmmUtils from "../../../utils/postMarketMonitoring.utils";
import * as pmmAccess from "../../../utils/pmmUseCaseAccess.utils";
import { sequelize } from "../../../database/db";
import "../../functions/pmmFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";

type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
const save = pmmUtils.savePMMResponsesQuery as unknown as AsyncMock;
const belong = pmmAccess.questionsBelongToPmmCycleQuery as unknown as AsyncMock;
const tx = { commit: jest.fn<any>(), rollback: jest.fn<any>() };

describe("agent_submit_pmm_responses", () => {
  const execute = writeToolExecutors.get("agent_submit_pmm_responses")!;
  const params = {
    cycle_id: 7,
    responses: [{ question_id: 40, response_value: "yes" }],
    _userId: 9,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (sequelize.transaction as unknown as AsyncMock).mockResolvedValue(tx);
  });

  it("refuses a question of another cycle's config, as the REST route does, and saves nothing", async () => {
    belong.mockResolvedValue(false);

    const result = (await execute(params, 4)) as any;

    expect(belong).toHaveBeenCalledWith(7, [40], 4);
    expect(result).toEqual({ success: false, message: "question_id 40 not found in cycle 7" });
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the cycle's own questions", async () => {
    belong.mockResolvedValue(true);

    await execute(params, 4);

    expect(save).toHaveBeenCalledTimes(1);
  });
});
