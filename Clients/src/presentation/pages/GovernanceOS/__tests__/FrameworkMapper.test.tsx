import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const baseMapping = {
  id: 1,
  organization_id: 1,
  source_framework_id: 1,
  source_control_type: "article",
  source_control_identifier: "Article 9",
  target_framework_id: 2,
  target_control_type: "control",
  target_control_identifier: "A.5.1",
  mapping_strength: "direct" as const,
  mapping_direction: "forward" as const,
  domain_tag: "risk_management",
  confidence_score: 0.9,
};

let mockAllMappings: any[] = [];
let mockAllMappingsLoading = false;
let mockPairwiseMappings: any[] = [baseMapping];
let mockPairwiseLoading = false;
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockBulkCreateMutate = vi.fn();
let mockDeletePending = false;
let mockBulkPending = false;

vi.mock("../../../../application/hooks/useGovernanceOs", () => ({
  useMappings: () => ({ data: mockAllMappings, isLoading: mockAllMappingsLoading }),
  useMappingsBetween: () => ({ data: mockPairwiseMappings, isLoading: mockPairwiseLoading }),
  useCreateMapping: () => ({ mutate: mockCreateMutate, isPending: false }),
  useUpdateMapping: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteMapping: () => ({ mutate: mockDeleteMutate, isPending: mockDeletePending }),
  useBulkCreateMappings: () => ({ mutate: mockBulkCreateMutate, isPending: mockBulkPending }),
}));

import FrameworkMapper from "../FrameworkMapper";

describe("FrameworkMapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllMappings = [];
    mockAllMappingsLoading = false;
    mockPairwiseMappings = [baseMapping];
    mockPairwiseLoading = false;
    mockDeletePending = false;
    mockBulkPending = false;
  });

  it("shows a loading spinner while pairwise mappings load", () => {
    mockPairwiseLoading = true;
    renderWithProviders(<FrameworkMapper />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders mapping cards when mappings are found", () => {
    renderWithProviders(<FrameworkMapper />);

    expect(screen.getByText("1 mapping(s) found")).toBeInTheDocument();
    expect(screen.getByText("Article 9")).toBeInTheDocument();
    expect(screen.getByText("A.5.1")).toBeInTheDocument();
  });

  it("shows an empty state when there are no mappings", () => {
    mockPairwiseMappings = [];
    renderWithProviders(<FrameworkMapper />);

    expect(
      screen.getByText("No mappings found for the selected frameworks and filters."),
    ).toBeInTheDocument();
  });

  it("filters mappings by domain tile", () => {
    mockPairwiseMappings = [
      baseMapping,
      { ...baseMapping, id: 2, domain_tag: "privacy", source_control_identifier: "Article 10" },
    ];
    renderWithProviders(<FrameworkMapper />);

    expect(screen.getByText("2 mapping(s) found")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("privacy")[0]);
    expect(screen.getByText("1 mapping(s) found")).toBeInTheDocument();
    expect(screen.getByText("Article 10")).toBeInTheDocument();
  });

  it("opens the create mapping modal", () => {
    renderWithProviders(<FrameworkMapper />);

    fireEvent.click(screen.getByRole("button", { name: "New Mapping" }));

    expect(screen.getByText("New Mapping", { selector: "h2, [id]" })).toBeInTheDocument();
  });

  it("opens the bulk import modal", () => {
    renderWithProviders(<FrameworkMapper />);

    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByText("Bulk Import Mappings")).toBeInTheDocument();
  });

  it("switches to matrix view mode", () => {
    mockAllMappings = [baseMapping];
    renderWithProviders(<FrameworkMapper />);

    const toggles = screen.getAllByRole("button");
    const matrixToggle = toggles.find((b) => b.querySelector("svg.lucide-grid-3x3"));
    expect(matrixToggle).toBeTruthy();
    fireEvent.click(matrixToggle!);

    // In matrix mode the mapping count reflects allMappings, not pairwiseMappings
    expect(screen.getByText("1 mapping(s) found")).toBeInTheDocument();
  });

  it("submits a create-mapping form", async () => {
    renderWithProviders(<FrameworkMapper />);

    fireEvent.click(screen.getByRole("button", { name: "New Mapping" }));

    fireEvent.change(screen.getByLabelText("Source Control Identifier *"), {
      target: { value: "Article 5" },
    });
    fireEvent.change(screen.getByLabelText("Target Control Identifier *"), {
      target: { value: "A.1.1" },
    });

    const submitButton = screen.getByRole("button", { name: "Create Mapping" });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
    fireEvent.click(submitButton);

    expect(mockCreateMutate).toHaveBeenCalled();
  });
});
