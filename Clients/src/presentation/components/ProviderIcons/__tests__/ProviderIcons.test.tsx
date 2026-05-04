import { PROVIDER_ICONS, VENDOR_ICON_MAP } from "../index";

describe("ProviderIcons", () => {
  it("exports PROVIDER_ICONS as a non-empty record", () => {
    expect(Object.keys(PROVIDER_ICONS).length).toBeGreaterThan(0);
  });

  it("contains expected provider keys", () => {
    const expectedKeys = ["OpenAI", "Anthropic", "Google", "Microsoft", "Meta"];

    for (const key of expectedKeys) {
      expect(PROVIDER_ICONS).toHaveProperty(key);
    }
  });

  it("maps each PROVIDER_ICONS value to a component (function)", () => {
    for (const [, Icon] of Object.entries(PROVIDER_ICONS)) {
      expect(typeof Icon).toBe("function");
    }
  });

  it("exports VENDOR_ICON_MAP with correct mappings", () => {
    expect(VENDOR_ICON_MAP["Mistral AI"]).toBe("Mistral");
    expect(VENDOR_ICON_MAP["Hugging Face"]).toBe("HuggingFace");
    expect(VENDOR_ICON_MAP["AI21 Labs"]).toBe("Ai21");
    expect(VENDOR_ICON_MAP["Amazon"]).toBe("Aws");
  });

  it("resolves VENDOR_ICON_MAP values to valid PROVIDER_ICONS keys", () => {
    for (const [, iconKey] of Object.entries(VENDOR_ICON_MAP)) {
      expect(PROVIDER_ICONS).toHaveProperty(iconKey, expect.any(Function));
    }
  });
});
