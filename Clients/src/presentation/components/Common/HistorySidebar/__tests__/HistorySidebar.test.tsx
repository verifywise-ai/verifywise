import { screen } from "@testing-library/react";
import { vi } from "vitest";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { HistorySidebar } from "../index";
import type { EntityChangeHistoryEntry } from "../../../../../application/hooks/useEntityChangeHistory";

const mockFetchPhoto = vi.fn().mockResolvedValue(null);
let mockHistory: EntityChangeHistoryEntry[] = [];

vi.mock("../../../../../application/hooks/useEntityChangeHistory", () => ({
  useEntityChangeHistory: () => ({
    data: { pages: [{ data: mockHistory }] },
    isLoading: false,
    isError: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));
vi.mock("../../../../../application/hooks/useProfilePhotoFetch", () => ({
  useProfilePhotoFetch: () => ({ fetchProfilePhotoAsBlobUrl: mockFetchPhoto }),
}));

const entry = (overrides: Partial<EntityChangeHistoryEntry>): EntityChangeHistoryEntry => ({
  id: 1,
  action: "updated",
  field_name: "Mitigation status",
  old_value: "Completed",
  new_value: "Requires review",
  changed_by_user_id: null,
  changed_at: "2026-10-05T10:00:00Z",
  ...overrides,
});

describe("HistorySidebar actor label", () => {
  beforeEach(() => {
    mockFetchPhoto.mockClear();
  });

  it("shows a change made by an unattended job as System, not a deleted user", () => {
    mockHistory = [entry({ id: 1, changed_by_system: true })];
    renderWithProviders(<HistorySidebar isOpen entityType="risk" entityId={10} inline />);

    expect(screen.getByText(/^System updated 1 field$/)).toBeInTheDocument();
    expect(screen.queryByText(/Deleted User/)).not.toBeInTheDocument();
  });

  it("still shows a null actor without the system flag as a deleted user", () => {
    mockHistory = [entry({ id: 2, changed_at: "2026-10-04T10:00:00Z" })];
    renderWithProviders(<HistorySidebar isOpen entityType="risk" entityId={10} inline />);

    expect(screen.getByText(/^Deleted User updated 1 field$/)).toBeInTheDocument();
  });

  it("never requests a profile photo for a missing user", () => {
    mockHistory = [
      entry({ id: 1, changed_by_system: true }),
      entry({ id: 2, changed_at: "2026-10-04T10:00:00Z", changed_by_user_id: 7 }),
    ];
    renderWithProviders(<HistorySidebar isOpen entityType="risk" entityId={10} inline />);

    expect(mockFetchPhoto).toHaveBeenCalledTimes(1);
    expect(mockFetchPhoto).toHaveBeenCalledWith(7);
  });
});
