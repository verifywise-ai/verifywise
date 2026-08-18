import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockUseEntityChangeHistory = vi.fn();
vi.mock("../../../../application/hooks/useEntityChangeHistory", () => ({
  useEntityChangeHistory: (...args: any[]) => mockUseEntityChangeHistory(...args),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

vi.mock("../../../../application/hooks/useProfilePhotoFetch", () => ({
  useProfilePhotoFetch: () => ({ fetchProfilePhotoAsBlobUrl: vi.fn().mockResolvedValue(null) }),
}));

import Activity from "./index";

const makeEntry = (overrides: Partial<any> = {}) => ({
  id: 1,
  action: "updated",
  field_name: "Name",
  old_value: "Old value",
  new_value: "New value",
  changed_by_user_id: 2,
  changed_at: "2024-05-01T12:00:00Z",
  user_name: "Jane",
  user_surname: "Doe",
  ...overrides,
});

const buildData = (entries: any[]) => ({
  pages: [{ data: entries, hasMore: false, total: entries.length }],
  pageParams: [0],
});

describe("Activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading spinner while history loads", () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an error state when loading fails", () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);
    expect(screen.getByText("Unable to load activity history")).toBeInTheDocument();
  });

  it("shows an empty state when there is no history", () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([]),
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);
    expect(screen.getByText("Activity history")).toBeInTheDocument();
  });

  it("renders a creation entry with attribution", async () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([
        makeEntry({ id: 1, action: "created", field_name: undefined }),
        makeEntry({ id: 2, action: "created", changed_at: "2024-05-01T12:00:01Z" }),
      ]),
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);

    await waitFor(() => {
      expect(screen.getByText("Created by")).toBeInTheDocument();
    });
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("groups and renders updated field entries with old and new values", async () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([makeEntry()]),
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);

    expect(await screen.findByText("Jane Doe updated 1 field")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Old value")).toBeInTheDocument();
    expect(screen.getByText("New value")).toBeInTheDocument();
  });

  it("labels the current user as 'You'", async () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([makeEntry({ changed_by_user_id: 1 })]),
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);

    expect(await screen.findByText("You updated 1 field")).toBeInTheDocument();
  });

  it("labels a deleted user's changes", async () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([
        makeEntry({ changed_by_user_id: 0, user_name: undefined, user_surname: undefined }),
      ]),
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);

    expect(await screen.findByText("Deleted User updated 1 field")).toBeInTheDocument();
  });

  it("truncates long values and toggles 'Show more' / 'Show less'", async () => {
    const longValue = "x".repeat(250);
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([makeEntry({ old_value: undefined, new_value: longValue })]),
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);

    const showMore = await screen.findByText("Show more");
    fireEvent.click(showMore);
    expect(await screen.findByText("Show less")).toBeInTheDocument();
  });

  it("shows a 'Load more' control and fetches the next page when clicked", async () => {
    const fetchNextPage = vi.fn();
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([makeEntry()]),
      isLoading: false,
      isError: false,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);

    const loadMore = await screen.findByText("Load more");
    fireEvent.click(loadMore);
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("shows a loading label while fetching the next page and does not trigger another fetch", async () => {
    const fetchNextPage = vi.fn();
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([makeEntry()]),
      isLoading: false,
      isError: false,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: true,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);

    const loading = await screen.findByText("Loading...");
    fireEvent.click(loading);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("renders a deleted-entity entry", async () => {
    mockUseEntityChangeHistory.mockReturnValue({
      data: buildData([makeEntry({ action: "deleted" })]),
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    renderWithProviders(<Activity entityType="use_case" entityId={1} />);

    expect(await screen.findByText("Jane Doe deleted this Use case")).toBeInTheDocument();
  });
});
