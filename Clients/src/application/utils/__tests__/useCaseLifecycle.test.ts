import { countLifecycleStages, lifecycleTabCount } from "../useCaseLifecycle";
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
