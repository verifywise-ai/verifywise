import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import NotesTab from "../NotesTab";

// Mock the notes repository so no real API calls are made
vi.mock("../../../../application/repository/notes.repository", () => ({
  getNotes: vi.fn().mockResolvedValue([]),
  createNote: vi.fn().mockResolvedValue({}),
  updateNote: vi.fn().mockResolvedValue({}),
  deleteNote: vi.fn().mockResolvedValue({}),
}));

// Mock useAuth to provide a test user
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userId: 1,
    userRoleName: "Admin",
  }),
}));

describe("NotesTab", () => {
  it("renders the notes section with empty state", async () => {
    renderWithProviders(<NotesTab attachedTo="TEST_ENTITY" attachedToId="42" />);

    // The empty state message should appear after loading
    expect(await screen.findByText("No notes yet")).toBeInTheDocument();
    expect(screen.getByText("Be the first to add one!")).toBeInTheDocument();
  });
});
