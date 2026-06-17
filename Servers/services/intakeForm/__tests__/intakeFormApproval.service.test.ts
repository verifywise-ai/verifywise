import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../utils/modelInventory.utils", () => ({
  createNewModelInventoryQuery: jest.fn<any>(),
}));

jest.mock("../../../utils/project.utils", () => ({
  createNewProjectQuery: jest.fn<any>(),
}));

jest.mock("../../../domain.layer/models/modelInventory/modelInventory.model", () => ({
  ModelInventoryModel: {
    createNewModelInventory: jest.fn((data) => ({ ...data, _model: true })),
  },
}));

import {
  createEntityFromSubmission,
  UnsupportedEntityTypeError,
} from "../intakeFormApproval.service";
import { createNewModelInventoryQuery } from "../../../utils/modelInventory.utils";
import { createNewProjectQuery } from "../../../utils/project.utils";
import { IntakeEntityType } from "../../../domain.layer/enums/intake-entity-type.enum";

const mockCreateModel = createNewModelInventoryQuery as jest.MockedFunction<
  typeof createNewModelInventoryQuery
>;
const mockCreateProject = createNewProjectQuery as jest.MockedFunction<typeof createNewProjectQuery>;

const fakeTransaction = {} as any;

describe("createEntityFromSubmission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a Model entity and returns its id", async () => {
    mockCreateModel.mockResolvedValueOnce({ id: 11 } as any);

    const id = await createEntityFromSubmission(
      IntakeEntityType.MODEL,
      { provider: "OpenAI", name: "gpt-4", security_assessment: true },
      1,
      99,
      fakeTransaction,
    );

    expect(id).toBe(11);
    expect(mockCreateModel).toHaveBeenCalledTimes(1);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it("creates a Project entity for use_case and returns its id", async () => {
    mockCreateProject.mockResolvedValueOnce({ id: 22 } as any);

    const id = await createEntityFromSubmission(
      IntakeEntityType.USE_CASE,
      {
        project_title: "Demo",
        description: "X",
        ai_risk_classification: "high",
        geography: "3",
      },
      7,
      99,
      fakeTransaction,
    );

    expect(id).toBe(22);
    expect(mockCreateProject).toHaveBeenCalledTimes(1);
    const args = mockCreateProject.mock.calls[0];
    expect((args[0] as any).project_title).toBe("Demo");
    expect((args[0] as any).geography).toBe(3);
  });

  it("throws UnsupportedEntityTypeError for unknown entity type", async () => {
    await expect(
      createEntityFromSubmission(
        "WEAPON" as any,
        {},
        1,
        99,
        fakeTransaction,
      ),
    ).rejects.toBeInstanceOf(UnsupportedEntityTypeError);
  });
});
