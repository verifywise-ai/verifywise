import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockGetAllProjectRisksByProjectId = vi.fn();
vi.mock("../../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisksByProjectId: (...args: any[]) => mockGetAllProjectRisksByProjectId(...args),
}));

let capturedFetchRisks: ((filter?: string) => Promise<any>) | undefined;
let capturedRefreshTrigger: number | undefined;
vi.mock("../../../../components/RisksView", () => ({
  default: ({ fetchRisks, title, readOnly, actions, refreshTrigger }: any) => {
    capturedFetchRisks = fetchRisks;
    capturedRefreshTrigger = refreshTrigger;
    return (
      <div data-testid="risks-view">
        {title} {readOnly ? "read-only" : "editable"}
        {actions}
      </div>
    );
  },
}));

let capturedFormProps: any;
vi.mock("../../../../components/AddNewRiskForm", () => ({
  default: (props: any) => {
    capturedFormProps = props;
    return <div data-testid="add-new-risk-form" />;
  },
}));

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import VWProjectRisks from "./index";
import { useAuth } from "../../../../../application/hooks/useAuth";
import type { Project } from "../../../../../domain/types/Project";

describe("ProjectRisks (V1.0ProjectView)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFetchRisks = undefined;
    capturedRefreshTrigger = undefined;
    capturedFormProps = undefined;
    (useAuth as any).mockReturnValue({ userRoleName: "Admin" });
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

  it("offers an add new risk button", () => {
    renderWithProviders(<VWProjectRisks project={{ id: 3 } as Project} />, {
      route: "/project-view?projectId=3",
    });
    expect(screen.getByRole("button", { name: /add new risk/i })).toBeEnabled();
  });

  it("disables the add button for roles that cannot create risks", () => {
    (useAuth as any).mockReturnValue({ userRoleName: "Auditor" });
    renderWithProviders(<VWProjectRisks project={{ id: 3 } as Project} />, {
      route: "/project-view?projectId=3",
    });
    expect(screen.getByRole("button", { name: /add new risk/i })).toBeDisabled();
  });

  it("opens the form pre-linked to this use case", async () => {
    renderWithProviders(<VWProjectRisks project={{ id: 3 } as Project} />, {
      route: "/project-view?projectId=9",
    });

    await userEvent.click(screen.getByRole("button", { name: /add new risk/i }));

    expect(screen.getByTestId("add-new-risk-form")).toBeInTheDocument();
    expect(capturedFormProps.popupStatus).toBe("new");
    expect(capturedFormProps.initialRiskValues.applicableProjects).toEqual([9]);
  });

  it("refreshes the risks list after a risk is created", async () => {
    renderWithProviders(<VWProjectRisks project={{ id: 3 } as Project} />, {
      route: "/project-view?projectId=9",
    });

    await userEvent.click(screen.getByRole("button", { name: /add new risk/i }));
    const before = capturedRefreshTrigger;

    capturedFormProps.onSuccess();

    await waitFor(() => expect(capturedRefreshTrigger).toBe(before! + 1));
  });
});
