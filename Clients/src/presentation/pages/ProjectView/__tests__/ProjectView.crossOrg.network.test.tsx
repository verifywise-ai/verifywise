/**
 * Project view — cross-organization isolation, all the way to the screen.
 *
 * The user is signed in to Org A and opens Org B's project by id. With the
 * cross-org guard installed, the API answers 403, and the page must show the
 * error toast and never render Org B's data. A control without the guard
 * proves the default mock would leak it, so the guarded assertions can fail.
 *
 * Everything from useProjectData down to the HTTP request is real, and so are
 * the header and breadcrumbs, the two places the project title renders. Only
 * the tab contents, which only mount once a project has loaded, are stubbed.
 *
 * @see docs/technical/security/tenant-isolation.md
 */

import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw/http";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AlertHost } from "../../../../test/AlertHost";
import { server } from "../../../../test/mocks/server";
import { crossOrgGuard, signInAs, signOut } from "../../../../test/mocks/crossOrgGuard";
import { OWN_ORG_ID, mockForeignProject } from "../../../../test/mocks/data/foreignOrg";
import { mockProjects } from "../../../../test/mocks/data/projects";

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin", userId: 1, userToken: { name: "Test User" } }),
}));

// renderWithProviders mounts <ExtensionsProvider>, so the mock re-exports it
// as a passthrough.
vi.mock("../../../../application/contexts/Extensions.context", () => ({
  useExtensions: () => ({ isEnabled: () => false }),
  ExtensionsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../Extensions/jira-assets/JiraUseCaseOverview", () => ({
  JiraUseCaseOverview: () => null,
}));
vi.mock("../../Extensions/jira-assets/JiraUseCaseMonitoring", () => ({
  JiraUseCaseMonitoring: () => null,
}));
vi.mock("../../Extensions/jira-assets/JiraUseCaseSettings", () => ({
  JiraUseCaseSettings: () => null,
}));

vi.mock("../V1.0ProjectView/Overview", () => ({
  default: () => <div data-testid="project-overview" />,
}));
vi.mock("../V1.0ProjectView/ProjectRisks", () => ({ default: () => null }));
vi.mock("../V1.0ProjectView/LinkedModels", () => ({ default: () => null }));
vi.mock("../ProjectSettings", () => ({ default: () => null }));
vi.mock("../ProjectFrameworks", () => ({ default: () => null }));
vi.mock("../CEMarking", () => ({ default: () => null }));
vi.mock("../Activity", () => ({ default: () => null }));
vi.mock("../PostMarketMonitoring", () => ({ default: () => null }));
vi.mock("../Fria", () => ({ default: () => null }));

import VWProjectView from "../V1.0ProjectView";

const FOREIGN_TITLE = mockForeignProject.project_title;
const OWN_PROJECT = mockProjects[0];

function renderProjectView(projectId: number) {
  return renderWithProviders(
    <>
      <AlertHost />
      <VWProjectView />
    </>,
    { route: `/project-view?projectId=${projectId}` },
  );
}

/** Resolves with the status MSW sent for GET /api/projects/:id. */
function projectResponseStatus(projectId: number): Promise<number> {
  return new Promise((resolve) => {
    const onResponse = ({ request, response }: { request: Request; response: Response }) => {
      if (new URL(request.url).pathname === `/api/projects/${projectId}`) {
        server.events.removeListener("response:mocked", onResponse);
        resolve(response.status);
      }
    };
    server.events.on("response:mocked", onResponse);
  });
}

describe("Project view: cross-organization isolation", () => {
  beforeEach(() => {
    signInAs(OWN_ORG_ID);
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Requests the page makes besides the project itself: the tab counts, and
    // the approval-request badges fetched once a user is signed in. They aren't
    // under test, but unhandled they fail as network errors and raise a generic
    // "An error occurred" toast that would be mistaken for the one under test.
    server.use(
      http.get("/api/projectRisks/by-projid/:projectId", () => HttpResponse.json({ data: [] })),
      http.get("/api/modelInventory/by-projectId/:projectId", () =>
        HttpResponse.json({ data: [] }),
      ),
      http.get("/api/approval-requests/pending-approvals", () => HttpResponse.json({ data: [] })),
      http.get("/api/approval-requests/my-requests", () => HttpResponse.json({ data: [] })),
    );
  });

  afterEach(() => {
    signOut();
  });

  it("renders Org B's project when no guard is installed (the leak the guard prevents)", async () => {
    renderProjectView(mockForeignProject.id);

    await waitFor(() => expect(document.body).toHaveTextContent(FOREIGN_TITLE));
  });

  it("shows the 403 as an error toast and never renders Org B's project", async () => {
    server.use(...crossOrgGuard());
    renderProjectView(mockForeignProject.id);

    const toast = await screen.findByRole("alert");
    expect(toast).toHaveTextContent("Error");
    expect(toast).toHaveTextContent("Access denied");

    expect(document.body).not.toHaveTextContent(FOREIGN_TITLE);
    // The page is still standing: no crash, no error boundary.
    expect(screen.getByText("Use cases")).toBeInTheDocument();
    // Not the logout branch customAxios takes for membership 403s.
    expect(document.body).not.toHaveTextContent("Please login again to continue.");
  });

  it("renders the caller's own project normally with the guard installed", async () => {
    server.use(...crossOrgGuard());
    renderProjectView(OWN_PROJECT.id);

    await waitFor(() => expect(document.body).toHaveTextContent(OWN_PROJECT.project_title));
    expect(screen.getByTestId("project-overview")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("with the backend's real 404, shows no toast and still never renders Org B's project", async () => {
    server.use(...crossOrgGuard({ status: 404, detail: "Project not found" }));
    const status = projectResponseStatus(mockForeignProject.id);
    renderProjectView(mockForeignProject.id);

    expect(await status).toBe(404);
    // Let customAxios's interceptor and useProjectData's handlers run.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    // customAxios deliberately raises no toast for 404 (callers treat it as empty state).
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(FOREIGN_TITLE);
    expect(screen.getByText("Use cases")).toBeInTheDocument();
  });
});
