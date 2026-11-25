import {
  countLifecycleStages,
  hasUseCaseWriteAccess,
  lifecycleTabCount,
} from "../useCaseLifecycle";
import { LifecycleStage } from "../../../domain/enums/lifecycleStage.enum";

describe("countLifecycleStages", () => {
  it("counts each stage, treats a missing stage as planned and skips organizational projects", () => {
    expect(
      countLifecycleStages([
        { lifecycle_stage: LifecycleStage.LIVE },
        { lifecycle_stage: LifecycleStage.LIVE },
        { lifecycle_stage: undefined },
        { lifecycle_stage: LifecycleStage.RETIRED },
        { lifecycle_stage: LifecycleStage.IN_REVIEW, is_organizational: true },
      ]),
    ).toEqual({ in_review: 0, planned: 1, live: 2, retired: 1 });
  });

  it("adds extra counts to a tab", () => {
    expect(lifecycleTabCount(LifecycleStage.IN_REVIEW, { in_review: 1 }, { in_review: 3 })).toBe(4);
  });
});

// Mirrors the server's write rule (getProjectAccessQuery): Admin and
// SuperAdmin see every use case, others need to own it or be a member.
describe("hasUseCaseWriteAccess", () => {
  it("allows the roles that see every use case, the owner and members", () => {
    expect(hasUseCaseWriteAccess("Admin", 5, 1, [])).toBe(true);
    expect(hasUseCaseWriteAccess("SuperAdmin", 5, 1, [])).toBe(true);
    expect(hasUseCaseWriteAccess("Editor", 1, 1, [])).toBe(true);
    expect(hasUseCaseWriteAccess("Editor", 2, 1, ["2"])).toBe(true);
    expect(hasUseCaseWriteAccess("Custom role", 2, 1, [2])).toBe(true);
  });

  it("refuses anyone else, and a signed-out user", () => {
    expect(hasUseCaseWriteAccess("Editor", 2, 1, ["3"])).toBe(false);
    expect(hasUseCaseWriteAccess("Editor", 2, null, undefined)).toBe(false);
    expect(hasUseCaseWriteAccess("Editor", null, 1, ["1"])).toBe(false);
  });
});
