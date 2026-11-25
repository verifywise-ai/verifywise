import { approvalLinkedEntity, approvalRequestPath } from "../approvalLinks.utils";
import { NotificationEntityType } from "../../domain.layer/interfaces/i.notification";

describe("approvalRequestPath", () => {
  it("opens the request in the approvals modal", () => {
    expect(approvalRequestPath(31)).toBe("/approval-workflows?request=31");
  });
});

describe("approvalLinkedEntity", () => {
  it("returns a use case or a policy with its own id", () => {
    expect(approvalLinkedEntity("use_case", 58)).toEqual({
      type: NotificationEntityType.USE_CASE,
      id: 58,
    });
    expect(approvalLinkedEntity("policy", 4)).toEqual({
      type: NotificationEntityType.POLICY,
      id: 4,
    });
  });

  it("returns null for entities without a page, or without an id", () => {
    expect(approvalLinkedEntity("ai_action", 7)).toBeNull();
    expect(approvalLinkedEntity("file", 7)).toBeNull();
    expect(approvalLinkedEntity("use_case", null)).toBeNull();
    expect(approvalLinkedEntity(undefined, undefined)).toBeNull();
  });
});
