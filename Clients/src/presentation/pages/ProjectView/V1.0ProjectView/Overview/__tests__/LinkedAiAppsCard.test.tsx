import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import LinkedAiAppsCard from "../LinkedAiAppsCard";
import CustomException from "../../../../../../infrastructure/exceptions/customeException";
import { Project } from "../../../../../../domain/types/Project";

const mockCreate = vi.fn();
let mockAiApps: unknown[] = [];
vi.mock("../../../../../../application/repository/aiApp.repository", () => ({
  getProjectAiApps: () => Promise.resolve(mockAiApps),
  getCreateAiAppPreview: () => Promise.resolve({ model_count: 3 }),
  createAiAppFromUseCase: (...args: unknown[]) => mockCreate(...args),
}));

let mockPermissions: string[] | undefined = [];
vi.mock("../../../../../../application/hooks/useMyPermissions", () => ({
  useMyPermissions: () => ({ permissions: mockPermissions, isLoading: false, error: null }),
}));

let mockRole = "Reviewer";
vi.mock("../../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockRole, userId: 5 }),
}));

const project = (overrides: Partial<Project> = {}): Project =>
  ({
    id: 11,
    project_title: "Fraud scoring",
    owner: 1,
    approval_status: null,
    ...overrides,
  }) as Project;

const BUTTON = "create-ai-app-from-use-case";

describe("LinkedAiAppsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAiApps = [];
    mockPermissions = [];
    mockRole = "Reviewer";
  });

  it("links each AI app to its detail page and shows the empty state otherwise", async () => {
    mockAiApps = [{ id: 7, name: "Assistant", status: "draft", lifecycle_stage: "planned" }];
    const { unmount } = renderWithProviders(<LinkedAiAppsCard project={project()} />);
    expect(await screen.findByTestId("linked-ai-app-7")).toHaveAttribute("href", "/ai-apps/7");
    unmount();

    mockAiApps = [];
    renderWithProviders(<LinkedAiAppsCard project={project()} />);
    expect(
      await screen.findByText("No AI apps are linked to this use case yet."),
    ).toBeInTheDocument();
  });

  it("hides the create button from someone without aiApp.edit", async () => {
    renderWithProviders(<LinkedAiAppsCard project={project()} />);
    await screen.findByText("Linked AI apps");
    expect(screen.queryByTestId(BUTTON)).toBeNull();
  });

  it("uses the role as a stand-in until permissions have loaded", async () => {
    mockPermissions = undefined;
    mockRole = "Editor";
    renderWithProviders(<LinkedAiAppsCard project={project()} />);
    expect(await screen.findByTestId(BUTTON)).toBeInTheDocument();
  });

  it.each(["pending", "rejected"] as const)(
    "hides the create button while the approval is %s",
    async (approval_status) => {
      mockPermissions = ["aiApp.edit"];
      renderWithProviders(<LinkedAiAppsCard project={project({ approval_status })} />);
      await screen.findByText("Linked AI apps");
      expect(screen.queryByTestId(BUTTON)).toBeNull();
    },
  );

  it("prefills the title, says what is copied and creates with the edited name", async () => {
    mockPermissions = ["aiApp.edit"];
    mockCreate.mockResolvedValue({ id: 9 });
    renderWithProviders(<LinkedAiAppsCard project={project()} />);

    fireEvent.click(await screen.findByTestId(BUTTON));

    const input = await screen.findByDisplayValue("Fraud scoring");
    expect(
      await screen.findByText("Copies the description, the owner and 3 linked models."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/has no account/)).toBeNull();

    fireEvent.change(input, { target: { value: "  Fraud app " } });
    fireEvent.click(screen.getByRole("button", { name: "Create AI app" }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(11, "Fraud app"));
    expect(await screen.findByText("AI app created from this use case")).toBeInTheDocument();
  });

  it.each([
    ["an external owner", { external_owner_name: "Ada", owner: null }],
    ["no owner", { owner: null }],
  ])("warns about the new owner for %s", async (_label, overrides) => {
    mockPermissions = ["aiApp.edit"];
    renderWithProviders(<LinkedAiAppsCard project={project(overrides as Partial<Project>)} />);
    fireEvent.click(await screen.findByTestId(BUTTON));
    expect(
      await screen.findByText(
        "This use case's owner has no account, so you will own the new AI app.",
      ),
    ).toBeInTheDocument();
  });

  it("requires a name without calling the server", async () => {
    mockPermissions = ["aiApp.edit"];
    renderWithProviders(<LinkedAiAppsCard project={project()} />);
    fireEvent.click(await screen.findByTestId(BUTTON));
    fireEvent.change(await screen.findByDisplayValue("Fraud scoring"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create AI app" }));

    expect(await screen.findByText("AI app name is required")).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("shows a 409 on the name field and keeps the modal open", async () => {
    mockPermissions = ["aiApp.edit"];
    mockCreate.mockRejectedValue(
      new CustomException("An AI app with this name already exists", 409, {}),
    );
    renderWithProviders(<LinkedAiAppsCard project={project()} />);
    fireEvent.click(await screen.findByTestId(BUTTON));
    await screen.findByDisplayValue("Fraud scoring");
    fireEvent.click(screen.getByRole("button", { name: "Create AI app" }));

    expect(await screen.findByText("An AI app with this name already exists")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fraud scoring")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create AI app" })).toBeInTheDocument();
  });
});
