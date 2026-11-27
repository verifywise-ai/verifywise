import { ruleActionsLabel } from "../ruleActions";

describe("ruleActionsLabel", () => {
  it("lists the type of each stored action", () => {
    expect(ruleActionsLabel([{ type: "send_alert" }, { type: "create_task" }])).toBe(
      "send alert, create task",
    );
  });

  it("says None for the legacy object of flags, as the server reads it", () => {
    expect(ruleActionsLabel({ notify: true, create_alert: true, auto_block: false })).toBe("None");
  });

  it("says None when there is no action", () => {
    expect(ruleActionsLabel([])).toBe("None");
    expect(ruleActionsLabel(null)).toBe("None");
    expect(ruleActionsLabel([{}, null, { type: "" }])).toBe("None");
  });
});
