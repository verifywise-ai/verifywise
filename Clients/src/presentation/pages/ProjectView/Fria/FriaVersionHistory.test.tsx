import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockGetVersions = vi.fn();

vi.mock("../../../../application/repository/fria.repository", () => ({
  friaRepository: {
    getVersions: (...args: any[]) => mockGetVersions(...args),
  },
}));

import FriaVersionHistory from "./FriaVersionHistory";

const v1 = {
  id: 1,
  fria_id: 5,
  version: 1,
  snapshot_reason: "Initial snapshot",
  created_by_name: "Reviewer One",
  created_at: "2024-01-01T10:00:00Z",
  snapshot_data: {
    assessment: { assessment_owner: "Alice", completion_pct: 10 },
    rights: [
      {
        id: 1,
        right_key: "dignity",
        right_title: "Dignity",
        flagged: false,
        severity: 0,
      },
    ],
    riskItems: [],
  },
};

const v2 = {
  id: 2,
  fria_id: 5,
  version: 2,
  snapshot_reason: "Updated after review",
  created_by_name: "Reviewer Two",
  created_at: "2024-02-01T10:00:00Z",
  snapshot_data: {
    assessment: { assessment_owner: "Bob", completion_pct: 50 },
    rights: [
      {
        id: 1,
        right_key: "dignity",
        right_title: "Dignity",
        flagged: true,
        severity: 2,
      },
    ],
    riskItems: [{ id: 1 }],
  },
};

describe("FriaVersionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inline mode fetches versions immediately and shows an empty state", async () => {
    mockGetVersions.mockResolvedValue([]);
    renderWithProviders(<FriaVersionHistory friaId={5} currentVersion={1} inline />);

    await waitFor(() => expect(mockGetVersions).toHaveBeenCalledWith(5));
    expect(
      await screen.findByText('No snapshots saved yet. Use "Save snapshot" to create one.'),
    ).toBeInTheDocument();
  });

  it("panel mode does not fetch until the header is expanded", async () => {
    mockGetVersions.mockResolvedValue([v2, v1]);
    renderWithProviders(<FriaVersionHistory friaId={5} currentVersion={2} />);

    expect(mockGetVersions).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Version history"));

    await waitFor(() => expect(mockGetVersions).toHaveBeenCalledWith(5));
    expect(await screen.findByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("shows an error message when fetching versions fails", async () => {
    mockGetVersions.mockRejectedValue(new Error("Failed to load version history"));
    renderWithProviders(<FriaVersionHistory friaId={5} currentVersion={1} inline />);

    expect(await screen.findByText("Failed to load version history")).toBeInTheDocument();
  });

  it("expands a version row to show the diff from the previous version", async () => {
    mockGetVersions.mockResolvedValue([v2, v1]);
    renderWithProviders(<FriaVersionHistory friaId={5} currentVersion={2} inline />);

    const v2Row = (await screen.findByText("v2")).closest("tr")!;
    fireEvent.click(v2Row);

    expect(await screen.findByText("Changes from previous version")).toBeInTheDocument();
    expect(screen.getByText("Assessment owner")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Dignity (flagged)")).toBeInTheDocument();
    expect(screen.getByText("Risk items")).toBeInTheDocument();
  });

  it("collapses an expanded row when clicked again", async () => {
    mockGetVersions.mockResolvedValue([v2, v1]);
    renderWithProviders(<FriaVersionHistory friaId={5} currentVersion={2} inline />);

    const v2Row = (await screen.findByText("v2")).closest("tr")!;
    fireEvent.click(v2Row);
    expect(await screen.findByText("Changes from previous version")).toBeInTheDocument();

    fireEvent.click(v2Row);
    await waitFor(() => {
      expect(screen.queryByText("Changes from previous version")).not.toBeInTheDocument();
    });
  });

  it("shows initial snapshot values for the first version with no previous snapshot", async () => {
    mockGetVersions.mockResolvedValue([v2, v1]);
    renderWithProviders(<FriaVersionHistory friaId={5} currentVersion={2} inline />);

    const v1Row = (await screen.findByText("v1")).closest("tr")!;
    fireEvent.click(v1Row);

    expect(await screen.findByText("Snapshot values")).toBeInTheDocument();
    expect(within(document.body).getByText("Assessment owner")).toBeInTheDocument();
  });

  it("shows a no-changes message when a snapshot has no diffs", async () => {
    const identical = { ...v1, id: 3, version: 3, snapshot_reason: "No change" };
    mockGetVersions.mockResolvedValue([identical, v1]);
    renderWithProviders(<FriaVersionHistory friaId={5} currentVersion={3} inline />);

    const row = (await screen.findByText("v3")).closest("tr")!;
    fireEvent.click(row);

    expect(await screen.findByText("No changes from previous version.")).toBeInTheDocument();
  });
});
