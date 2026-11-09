import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AIAppLinkedUseCases from "../AIAppLinkedUseCases";
import CustomException from "../../../../../infrastructure/exceptions/customeException";

const mockLink = vi.fn();
const mockUnlink = vi.fn();
let mockData: { use_cases: unknown[]; hidden_count: number } = { use_cases: [], hidden_count: 0 };
vi.mock("../../../../../application/repository/aiApp.repository", () => ({
  getAiAppUseCases: () => Promise.resolve(mockData),
  linkUseCaseToAiApp: (...args: unknown[]) => mockLink(...args),
  unlinkUseCaseFromAiApp: (...args: unknown[]) => mockUnlink(...args),
}));

let mockProjects: unknown[] = [];
let mockGetProjects: (() => Promise<unknown>) | null = null;
vi.mock("../../../../../application/repository/project.repository", () => ({
  getAllProjects: () =>
    mockGetProjects ? mockGetProjects() : Promise.resolve({ data: mockProjects }),
}));

let mockPermissions: string[] | undefined = [];
vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  useMyPermissions: () => ({ permissions: mockPermissions, isLoading: false, error: null }),
}));

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Reviewer", userId: 5 }),
}));

const linked = { id: 11, uc_id: "UC-1", project_title: "Fraud scoring", status: "In progress" };

describe("AIAppLinkedUseCases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = { use_cases: [linked], hidden_count: 0 };
    mockProjects = [];
    mockGetProjects = null;
    mockPermissions = [];
  });

  const openPicker = async () => {
    mockPermissions = ["aiApp.edit"];
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);
    fireEvent.click(await screen.findByTestId("ai-app-add-use-case"));
  };

  it("does not offer a use case whose approval is pending or rejected", async () => {
    mockProjects = [
      { id: 12, uc_id: "UC-2", project_title: "Claims triage" },
      { id: 14, uc_id: "UC-4", project_title: "Waiting", approval_status: "pending" },
      { id: 15, uc_id: "UC-5", project_title: "Refused", approval_status: "rejected" },
    ];
    await openPicker();
    fireEvent.mouseDown(await screen.findByPlaceholderText("Select a use case"));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["UC-2 - Claims triage"]);
  });

  it("says so while use cases load", async () => {
    mockGetProjects = () => new Promise(() => undefined);
    await openPicker();
    expect(await screen.findByPlaceholderText("Loading use cases...")).toBeInTheDocument();
  });

  it("says so when use cases fail to load", async () => {
    mockGetProjects = () => Promise.reject(new Error("boom"));
    await openPicker();
    expect(await screen.findByPlaceholderText("Could not load use cases")).toBeInTheDocument();
  });

  it("says when the organization has nothing linkable", async () => {
    mockData = { use_cases: [], hidden_count: 0 };
    mockProjects = [{ id: 13, project_title: "Org", is_organizational: true }];
    await openPicker();
    expect(
      await screen.findByPlaceholderText("No use cases can be linked yet"),
    ).toBeInTheDocument();
  });

  it("says when every linkable use case is already linked", async () => {
    mockProjects = [{ id: 11, uc_id: "UC-1", project_title: "Fraud scoring" }];
    await openPicker();
    expect(
      await screen.findByPlaceholderText("All use cases are already linked"),
    ).toBeInTheDocument();
  });

  it("reports a 404 on remove and refetches so the stale chip goes", async () => {
    mockPermissions = ["aiApp.edit"];
    mockUnlink.mockRejectedValue(new CustomException("Link not found", 404, {}));
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);
    const remove = await screen.findByRole("button", { name: "Remove Fraud scoring" });

    mockData = { use_cases: [], hidden_count: 0 };
    fireEvent.click(remove);

    expect(await screen.findByText("This use case is no longer linked")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("linked-use-case-11")).toBeNull());
  });

  it("reports a 404 on add and keeps the modal open", async () => {
    mockLink.mockRejectedValue(new CustomException("Not found", 404, {}));
    mockProjects = [{ id: 12, uc_id: "UC-2", project_title: "Claims triage" }];
    await openPicker();
    fireEvent.mouseDown(await screen.findByPlaceholderText("Select a use case"));
    fireEvent.click(await screen.findByRole("option", { name: "UC-2 - Claims triage" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("This use case or AI app is no longer available"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("leaves other failures to the global toast", async () => {
    mockPermissions = ["aiApp.edit"];
    mockUnlink.mockRejectedValue(new CustomException("Server error", 500, {}));
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove Fraud scoring" }));

    await waitFor(() => expect(mockUnlink).toHaveBeenCalled());
    expect(screen.queryByText("This use case is no longer linked")).toBeNull();
    expect(screen.queryByText("Use case removed")).toBeNull();
  });

  it("links each use case to its page", async () => {
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);
    expect(await screen.findByTestId("linked-use-case-11")).toHaveAttribute(
      "href",
      "/project-view?projectId=11",
    );
  });

  it("hides add and remove without aiApp.edit", async () => {
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);
    await screen.findByTestId("linked-use-case-11");
    expect(screen.queryByTestId("ai-app-add-use-case")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Fraud scoring" })).toBeNull();
  });

  it("removes a link for an aiApp.edit holder", async () => {
    mockPermissions = ["aiApp.edit"];
    mockUnlink.mockResolvedValue(undefined);
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove Fraud scoring" }));

    await waitFor(() => expect(mockUnlink).toHaveBeenCalledWith(3, 11));
  });

  it("offers only unlinked, non-organizational use cases and links the choice", async () => {
    mockPermissions = ["aiApp.edit"];
    mockLink.mockResolvedValue(undefined);
    mockProjects = [
      { id: 11, uc_id: "UC-1", project_title: "Fraud scoring" },
      { id: 12, uc_id: "UC-2", project_title: "Claims triage" },
      { id: 13, uc_id: "UC-3", project_title: "Org governance", is_organizational: true },
    ];
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);

    fireEvent.click(await screen.findByTestId("ai-app-add-use-case"));
    const input = await screen.findByPlaceholderText("Select a use case");
    fireEvent.mouseDown(input);

    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["UC-2 - Claims triage"]);

    fireEvent.click(screen.getByRole("option", { name: "UC-2 - Claims triage" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(mockLink).toHaveBeenCalledWith(3, 12));
  });

  it.each([
    [2, "2 more linked use cases you do not have access to"],
    [1, "1 more linked use case you do not have access to"],
  ])("says how many are hidden when %i is", async (hidden_count, text) => {
    mockData = { use_cases: [linked], hidden_count };
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText("No use cases are linked to this AI app yet.")).toBeNull();
  });

  it("shows the empty state only when nothing is linked at all", async () => {
    mockData = { use_cases: [], hidden_count: 0 };
    renderWithProviders(<AIAppLinkedUseCases appId={3} />);
    expect(
      await screen.findByText("No use cases are linked to this AI app yet."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("ai-app-hidden-use-cases")).toBeNull();
  });
});
