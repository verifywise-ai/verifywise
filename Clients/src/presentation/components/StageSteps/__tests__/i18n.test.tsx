/**
 * The phase 1 table search placeholder and the lifecycle step title in
 * German, French and Spanish, through the real translator and dictionary.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { LANGS, setLanguage, tr } from "../../../../test/i18nHelpers";
import StageSteps from "../index";
import SearchBox from "../../Search/SearchBox";

afterAll(() => setLanguage("en"));

describe.each(LANGS)("phase 1 table strings in %s", (lang) => {
  beforeEach(async () => {
    await setLanguage(lang);
  });

  it("translates the step title with its numbers filled in", () => {
    render(<StageSteps stage="planned" />);
    expect(screen.getByTestId("stage-steps")).toHaveAttribute(
      "title",
      tr(lang, "Step {current} of {total}", { current: 2, total: 4 }),
    );
  });

  it("translates the default search placeholder", () => {
    renderWithProviders(<SearchBox value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(tr(lang, "Search this list"))).toBeInTheDocument();
  });
});
