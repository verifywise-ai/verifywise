import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import DatasetTable from "../DatasetTable";
import type { IDataset } from "../../../../domain/interfaces/i.dataset";

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin", userToken: { name: "Test User" } }),
}));

/**
 * datasets.type and datasets.classification are nullable columns with no
 * default, so a row saved without them comes back from the API as null. This is
 * the shape that blanked the Datasets page.
 */
const datasetWithoutTypeOrClassification = {
  id: 1,
  name: "Applicant CV Corpus",
  description: "Anonymised CVs",
  version: "1.0",
  owner: "Dev Admin",
  type: null,
  function: "training",
  source: "internal",
  classification: null,
  contains_pii: true,
  status: "Active",
  status_date: "2026-07-30T00:00:00Z",
  updated_at: "2026-07-30T00:00:00Z",
} as unknown as IDataset;

describe("DatasetTable", () => {
  it("renders a dataset whose type and classification are null", () => {
    renderWithProviders(<DatasetTable data={[datasetWithoutTypeOrClassification]} />);
    expect(screen.getByText("Applicant CV Corpus")).toBeInTheDocument();
  });

  it("shows the empty placeholder instead of a chip for a missing type and classification", () => {
    renderWithProviders(<DatasetTable data={[datasetWithoutTypeOrClassification]} />);
    // Two cells fall back: TYPE and CLASSIFICATION. The other populated cells
    // render their own values, so the placeholder count is exactly two.
    expect(screen.getAllByText("-")).toHaveLength(2);
  });
});
