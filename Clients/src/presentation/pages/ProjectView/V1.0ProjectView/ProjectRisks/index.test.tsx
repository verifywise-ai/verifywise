import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockGetAllProjectRisksByProjectId = vi.fn();
vi.mock("../../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisksByProjectId: (...args: any[]) => mockGetAllProjectRisksByProjectId(...args),
}));

let capturedFetchRisks: ((filter?: string) => Promise<any>) | undefined;
vi.mock("../../../../components/RisksView", () => ({
  default: ({ fetchRisks, title, readOnly }: any) => {
    capturedFetchRisks = fetchRisks;
    return (
      <div data-testid="risks-view">
        {title} {readOnly ? "read-only" : "editable"}
      </div>
    );
  },
}));

import VWProjectRisks from "./index";
import type { Project } from "../../../../../domain/types/Project";

describe("ProjectRisks (V1.0ProjectView)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFetchRisks = undefined;
    mockGetAllProjectRisksByProjectId.mockResolvedValue({ data: [] });
  });

  it("renders the RisksView as read-only with the use case title", () => {
    renderWithProviders(<VWProjectRisks project={{ id: 3 } as Project} />, {
      route: "/project-view?projectId=3",
    });
    expect(screen.getByTestId("risks-view")).toHaveTextContent("Use case risks read-only");
  });

  it("fetches project risks scoped to the projectId query param", async () => {
    mockGetAllProjectRisksByProjectId.mockResolvedValue({ data: [{ id: 1 }] });
    renderWithProviders(<VWProjectRisks project={{ id: 3 } as Project} />, {
      route: "/project-view?projectId=9",
    });

    await waitFor(() => expect(capturedFetchRisks).toBeDefined());
    const result = await capturedFetchRisks!("active");

    expect(mockGetAllProjectRisksByProjectId).toHaveBeenCalledWith({
      projectId: "9",
      filter: "active",
    });
    expect(result).toEqual([{ id: 1 }]);
  });

  it("falls back to the project's own id when projectId is a plugin-prefixed id", async () => {
    renderWithProviders(<VWProjectRisks project={{ id: 3 } as Project} />, {
      route: "/project-view?projectId=plugin-prefix-11",
    });

    await waitFor(() => expect(capturedFetchRisks).toBeDefined());
    await capturedFetchRisks!();

    expect(mockGetAllProjectRisksByProjectId).toHaveBeenCalledWith({
      projectId: "11",
      filter: "active",
    });
  });

  it("propagates errors from the risks fetch", async () => {
    mockGetAllProjectRisksByProjectId.mockRejectedValue(new Error("network error"));
    renderWithProviders(<VWProjectRisks project={{ id: 3 } as Project} />, {
      route: "/project-view?projectId=3",
    });

    await waitFor(() => expect(capturedFetchRisks).toBeDefined());
    await expect(capturedFetchRisks!()).rejects.toThrow("network error");
  });
});
