import { isRuleActionList, ruleActionTypes } from "../shadowAiRuleActions.utils";

describe("ruleActionTypes", () => {
  it("returns the type of each stored action", () => {
    expect(ruleActionTypes([{ type: "send_alert" }, { type: "create_task" }])).toEqual([
      "send_alert",
      "create_task",
    ]);
  });

  it("returns no types for the legacy object of flags instead of throwing", () => {
    expect(ruleActionTypes({ notify: true, create_alert: true, auto_block: false })).toEqual([]);
  });

  it("skips entries without a string type", () => {
    expect(ruleActionTypes([{}, null, { type: 3 }, { type: "" }, { type: "send_alert" }])).toEqual([
      "send_alert",
    ]);
    expect(ruleActionTypes(undefined)).toEqual([]);
  });
});

describe("isRuleActionList", () => {
  it("accepts an array of actions that each have a type", () => {
    expect(isRuleActionList([{ type: "send_alert" }, { type: "in_app", assign_to: 3 }])).toBe(true);
    expect(isRuleActionList([])).toBe(true);
  });

  it("rejects the legacy object, strings and actions without a type", () => {
    expect(isRuleActionList({ notify: true })).toBe(false);
    expect(isRuleActionList(["notify"])).toBe(false);
    expect(isRuleActionList([{}])).toBe(false);
    expect(isRuleActionList([{ type: "" }])).toBe(false);
    expect(isRuleActionList([null])).toBe(false);
    expect(isRuleActionList(undefined)).toBe(false);
  });
});
