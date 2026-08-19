import { tabIndicatorStyle, tabContainerStyle, settingTabStyle } from "../style";

describe("SettingsPage style", () => {
  it("exports a tab indicator style with a backgroundColor", () => {
    expect(tabIndicatorStyle).toEqual({
      style: { backgroundColor: expect.any(String) },
    });
  });

  it("exports a tab container style with the flex container gap", () => {
    expect(tabContainerStyle["& .MuiTabs-flexContainer"]).toEqual({ columnGap: "34px" });
    expect(tabContainerStyle.minHeight).toBe("20px");
  });

  it("exports a setting tab style with the selected-state color", () => {
    expect(settingTabStyle.textTransform).toBe("none");
    expect(settingTabStyle.minHeight).toBe("20px");
    expect(settingTabStyle["&.Mui-selected"]).toEqual({ color: expect.any(String) });
  });
});
