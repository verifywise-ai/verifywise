import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockGetAllEntities = vi.fn();
vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: any[]) => mockGetAllEntities(...args),
}));

let capturedFetchModels: (() => Promise<any>) | undefined;
vi.mock("../../../../components/LinkedModelsView", () => ({
  LinkedModelsView: ({ fetchModels, emptyMessage }: any) => {
    capturedFetchModels = fetchModels;
    return <div data-testid="linked-models-view">{emptyMessage}</div>;
  },
}));

import LinkedModels from "./index";
import type { Project } from "../../../../../domain/types/Project";

describe("LinkedModels (V1.0ProjectView)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFetchModels = undefined;
  });

  it("shows a fallback message when no project is provided", () => {
    renderWithProviders(<LinkedModels />);
    expect(screen.getByText("No project selected")).toBeInTheDocument();
  });

  it("renders LinkedModelsView with the empty-state message for a project", () => {
    renderWithProviders(<LinkedModels project={{ id: 3 } as Project} />);
    expect(screen.getByTestId("linked-models-view")).toHaveTextContent(
      "No AI models linked to this project yet",
    );
  });

  it("fetches linked models scoped to the project id", async () => {
    mockGetAllEntities.mockResolvedValue({ data: [{ id: 1, name: "Model A" }] });
    renderWithProviders(<LinkedModels project={{ id: 3 } as Project} />);

    await waitFor(() => expect(capturedFetchModels).toBeDefined());
    const result = await capturedFetchModels!();

    expect(mockGetAllEntities).toHaveBeenCalledWith({
      routeUrl: "/modelInventory/by-projectId/3",
    });
    expect(result).toEqual([{ id: 1, name: "Model A" }]);
  });

  it("propagates errors from the models fetch", async () => {
    mockGetAllEntities.mockRejectedValue(new Error("network error"));
    renderWithProviders(<LinkedModels project={{ id: 3 } as Project} />);

    await waitFor(() => expect(capturedFetchModels).toBeDefined());
    await expect(capturedFetchModels!()).rejects.toThrow("network error");
  });
});
