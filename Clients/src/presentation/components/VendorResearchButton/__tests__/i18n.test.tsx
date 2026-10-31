/**
 * The research button in German, French and Spanish, through the real DOM translator and
 * dictionary (nothing about translation is mocked). Each case ends with the translator's gap
 * audit: whatever English text it could not find in the dictionary fails the case.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import {
  LANGS,
  expectNoUntranslatedText,
  resetAudit,
  setLanguage,
  tr,
} from "../../../../test/i18nHelpers";
import { AfterSettings, SET_UP } from "./fixtures";

vi.mock("../../../../application/repository/vendorResearch.repository", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../application/repository/vendorResearch.repository")
  >()),
  getVendorResearchConfig: vi.fn(),
  startVendorResearch: vi.fn(),
}));

vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: (key: string) => key === "vendor.edit",
}));

import * as repository from "../../../../application/repository/vendorResearch.repository";
import VendorResearchButton from "..";

const getConfig = vi.mocked(repository.getVendorResearchConfig);

/** The vendor's name is the user's own data, never translated. */
const FIXTURES = new Set(["Acme Cloud"]);

const renderButton = () =>
  renderWithProviders(
    <AfterSettings>
      <VendorResearchButton vendorId={7} vendorName="Acme Cloud" onNotify={vi.fn()} />
    </AfterSettings>,
  );

afterAll(() => setLanguage("en"));

describe.each(LANGS)("the research button in %s", (lang) => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setLanguage(lang, true);
    resetAudit();
  });

  it("translates its name and its tooltip", async () => {
    getConfig.mockResolvedValue(SET_UP);
    renderButton();

    const button = await screen.findByRole("button", { name: tr(lang, "Research risks") });
    await userEvent.hover(button);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(tr(lang, "Research risks"));
    expectNoUntranslatedText(lang, FIXTURES);
  });

  it("translates the tooltip of a button that is disabled because research is not set up", async () => {
    getConfig.mockResolvedValue({ ...SET_UP, hasLlmKey: false });
    renderButton();

    const button = await screen.findByRole("button", { name: tr(lang, "Research risks") });
    expect(button).toBeDisabled();
    await userEvent.hover(button.parentElement as HTMLElement);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      tr(lang, "Vendor research is not set up."),
    );
    expectNoUntranslatedText(lang, FIXTURES);
  });
});
