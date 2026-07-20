import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

const mutate = vi.fn();

vi.mock("../../../../application/hooks/useReporting", () => ({
  useSectionCatalog: () => ({
    data: [
      { key: "projectRisks", label: "Use case risks", group: "Risk analysis" },
      { key: "vendors", label: "Vendors", group: "Organization" },
    ],
    isLoading: false,
  }),
  useCreateTemplate: () => ({ mutate, isPending: false }),
}));

import TemplateBuilder from "../TemplateBuilder";

beforeEach(() => mutate.mockReset());

describe("TemplateBuilder", () => {
  it("renders catalog sections grouped", () => {
    render(<TemplateBuilder onClose={() => {}} />);
    // Next is disabled until the template is named — fill it first or this
    // click is a no-op and the assertions below fail on step 0.
    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: "Board pack" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Use case risks")).toBeInTheDocument();
    expect(screen.getByText("Risk analysis")).toBeInTheDocument();
  });

  it("blocks Next until the template has a name", () => {
    render(<TemplateBuilder onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: "Board pack" },
    });
    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
  });

  it("submits name, sections and the seven AI blocks", () => {
    render(<TemplateBuilder onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: "Board pack" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // sections
    fireEvent.click(screen.getByLabelText("Use case risks"));
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // AI
    fireEvent.click(screen.getByRole("button", { name: /create template/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const body = mutate.mock.calls[0][0];
    expect(body.name).toBe("Board pack");
    expect(body.sections_config.sections).toHaveLength(1);
    expect(body.sections_config.sections[0].reportSectionKey).toBe("projectRisks");
    // All seven blocks must be present as explicit booleans; a missing key
    // reads as "off" on the backend, which is a different meaning from false.
    expect(Object.keys(body.ai_blocks_config)).toHaveLength(7);
  });
});
