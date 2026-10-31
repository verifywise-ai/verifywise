import { vi } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import UseCaseDefaultsSection from "../UseCaseDefaultsSection";

const save = vi.fn();
let settings: any = { organization_id: 2, default_geography: null, default_framework_ids: [] };

vi.mock("../../../../../application/hooks/useUseCaseOrgSettings", () => ({
  useUseCaseOrgSettings: () => ({ data: settings }),
  useUpdateUseCaseOrgSettings: () => ({ mutateAsync: save, isPending: false }),
}));

vi.mock("../../../../../application/hooks/useFrameworks", () => ({
  default: () => ({
    allFrameworks: [
      { id: 1, name: "EU AI Act", is_organizational: false },
      { id: 2, name: "ISO 42001", is_organizational: true },
      { id: 12, name: "NYC Local Law 144", is_organizational: false },
    ],
  }),
}));

const pickRegion = async (name: string) => {
  fireEvent.mouseDown(
    within(screen.getByTestId("use-case-defaults-section")).getAllByRole("combobox")[0],
  );
  fireEvent.click(await screen.findByRole("option", { name }));
};

beforeEach(() => {
  save.mockReset().mockResolvedValue(settings);
  settings = { organization_id: 2, default_geography: null, default_framework_ids: [] };
});

describe("UseCaseDefaultsSection", () => {
  it("suggests the EU AI Act when Europe is picked and saves both", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(<UseCaseDefaultsSection onError={vi.fn()} onSuccess={onSuccess} />);

    await pickRegion("Europe");
    fireEvent.click(screen.getByTestId("use-case-defaults-save-btn"));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ default_geography: 2, default_framework_ids: [1] }),
    );
    expect(onSuccess).toHaveBeenCalledWith("Use case defaults saved");
  });

  it("keeps frameworks already picked when Europe is chosen", async () => {
    settings = { organization_id: 2, default_geography: null, default_framework_ids: [12] };
    renderWithProviders(<UseCaseDefaultsSection onError={vi.fn()} onSuccess={vi.fn()} />);

    await pickRegion("Europe");
    fireEvent.click(screen.getByTestId("use-case-defaults-save-btn"));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ default_geography: 2, default_framework_ids: [12] }),
    );
  });

  it("offers only frameworks that apply to a single use case", async () => {
    renderWithProviders(<UseCaseDefaultsSection onError={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.mouseDown(
      within(screen.getByTestId("use-case-defaults-section")).getAllByRole("combobox")[1],
    );
    expect(await screen.findByRole("option", { name: /EU AI Act/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /ISO 42001/ })).toBeNull();
  });

  it("reports a failed save", async () => {
    save.mockRejectedValue(
      new Error("Only frameworks that apply to a single use case can be defaults"),
    );
    const onError = vi.fn();
    renderWithProviders(<UseCaseDefaultsSection onError={onError} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByTestId("use-case-defaults-save-btn"));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        "Only frameworks that apply to a single use case can be defaults",
      ),
    );
  });

  it("clears a saved region with No default", async () => {
    settings = { organization_id: 2, default_geography: 2, default_framework_ids: [1] };
    renderWithProviders(<UseCaseDefaultsSection onError={vi.fn()} onSuccess={vi.fn()} />);

    await pickRegion("No default");
    fireEvent.click(screen.getByTestId("use-case-defaults-save-btn"));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ default_geography: null, default_framework_ids: [1] }),
    );
  });

  it("never offers the frameworks placeholder as a choice", async () => {
    renderWithProviders(<UseCaseDefaultsSection onError={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.mouseDown(
      within(screen.getByTestId("use-case-defaults-section")).getAllByRole("combobox")[1],
    );
    await screen.findByRole("option", { name: /EU AI Act/ });
    // Rendered for the empty state, but hidden from the list.
    const placeholder = document.querySelector(".select-placeholder");
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveStyle({ display: "none" });
  });

  it("is read-only for a non-Admin", () => {
    renderWithProviders(
      <UseCaseDefaultsSection isDisabled onError={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByTestId("use-case-defaults-save-btn")).toBeDisabled();
  });
});
