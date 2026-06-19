import { sanitizeRecommendedActions } from "../aiSummarizer";

describe("sanitizeRecommendedActions", () => {
  const members = ["alice@x.com", "Risk Owner"];
  it("keeps owner when it matches a known member/role", () => {
    const out = sanitizeRecommendedActions([{ action: "Do X", suggestedOwner: "alice@x.com" }], members);
    expect(out[0].suggestedOwner).toBe("alice@x.com");
  });
  it("drops invented owner not in the allowed list", () => {
    const out = sanitizeRecommendedActions([{ action: "Do X", suggestedOwner: "ghost@nowhere.com" }], members);
    expect(out[0].suggestedOwner).toBeUndefined();
  });
});
