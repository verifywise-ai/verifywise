import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { MemoryRouter } from "react-router";
import { light } from "../../../themes";

const panelProps = vi.fn();
vi.mock("../../../components/ExtensionSyncPanel", () => ({
  default: (props: Record<string, unknown>) => {
    panelProps(props);
    return <div data-testid="shared-sync-panel" />;
  },
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));
vi.mock("../../../../application/hooks/useFormattedDate", () => ({
  default: () => () => "14-10-2026",
}));
vi.mock("../../../../application/repository/project.repository", () => ({
  getAllProjects: vi.fn().mockResolvedValue({ data: [{ id: 7, project_title: "Fraud model" }] }),
}));
const repo = vi.hoisted(() => ({
  getJiraIncidentsConfig: vi.fn(),
  saveJiraIncidentsConfig: vi.fn(),
  testJiraIncidentsConnection: vi.fn(),
  getJiraProjects: vi.fn(),
  getJiraIssueTypes: vi.fn(),
  getJiraStatuses: vi.fn(),
  getJiraPriorities: vi.fn(),
  getJiraLabels: vi.fn(),
  getJiraIncidentEvents: vi.fn(),
  getJiraIncidentLinks: vi.fn(),
}));
vi.mock("../../../../application/repository/jiraIncidents.repository", () => repo);

import { JiraIncidentsConfiguration } from "./JiraIncidentsConfiguration";

const SAVED = {
  configured: true,
  site_url: "https://acme.atlassian.net",
  email: "svc@acme.co",
  has_api_token: true,
  service_account_id: "svc-1",
  service_account_time_zone: "UTC",
  project_id: "10000",
  project_key: "SEC",
  issue_type_id: "10001",
  label: null,
  status_map_in: {},
  status_map_out: {},
  severity_map: {},
  default_project_id: 7,
  default_type: "Malfunction",
  default_reporter: "Jira sync",
  import_from: null,
  last_checked_at: null,
  readiness: { ready: false, reason: "Map Jira statuses to VerifyWise statuses" },
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={light}>
        <JiraIncidentsConfiguration />
      </ThemeProvider>
    </MemoryRouter>,
  );

describe("JiraIncidentsConfiguration", () => {
  beforeEach(() => {
    Object.values(repo).forEach((fn) => fn.mockReset());
    panelProps.mockReset();
    repo.getJiraIncidentsConfig.mockResolvedValue(SAVED);
    repo.getJiraProjects.mockResolvedValue([{ id: "10000", key: "SEC", name: "Security" }]);
    repo.getJiraIssueTypes.mockResolvedValue([{ id: "10001", name: "Incident" }]);
    repo.getJiraStatuses.mockResolvedValue({
      statuses: [
        { id: "1", name: "To Do", categoryKey: "new" },
        { id: "4", name: "Done", categoryKey: "done" },
      ],
      default_map_in: { "1": "Open", "4": "Closed" },
      default_map_out: {
        "Open": "1",
        "Investigating": null,
        "Closed": "4",
        "Mitigated": null,
        "Suspended": null,
        "Emergency action": null,
      },
    });
    repo.getJiraPriorities.mockResolvedValue({
      priorities: [{ id: "2", name: "High" }],
      default_severity_map: { "2": "Very serious" },
    });
    repo.getJiraIncidentEvents.mockResolvedValue([]);
    repo.getJiraLabels.mockResolvedValue([]);
  });

  it("shows the help text and the readiness reason", async () => {
    renderPage();
    expect(
      await screen.findByText(/Only issues created in Jira after this is set up are imported/),
    ).toBeInTheDocument();
    expect(await screen.findByText("Map Jira statuses to VerifyWise statuses")).toBeInTheDocument();
  });

  it("prefills mappings from the server's defaults and saves them without a token", async () => {
    repo.saveJiraIncidentsConfig.mockResolvedValue({
      ...SAVED,
      readiness: { ready: true, reason: null },
    });
    renderPage();
    // The Jira status row label, and the selected value in the VerifyWise to Jira table.
    await waitFor(() => expect(screen.getAllByText("To Do").length).toBeGreaterThan(0));
    await screen.findByText("High");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(repo.saveJiraIncidentsConfig).toHaveBeenCalled());
    const input = repo.saveJiraIncidentsConfig.mock.calls[0][0];
    expect(input).not.toHaveProperty("api_token");
    expect(input.status_map_in).toEqual({ "1": "Open", "4": "Closed" });
    expect(input.status_map_out).toMatchObject({ Open: "1", Mitigated: null });
    expect(input.severity_map).toEqual({ "2": "Very serious" });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("blocks save and asks for the token after the site URL changes", async () => {
    renderPage();
    const site = await screen.findByDisplayValue("https://acme.atlassian.net");
    fireEvent.change(site, { target: { value: "https://other.atlassian.net" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Enter the API token again after changing the site URL or email"),
    ).toBeInTheDocument();
    expect(repo.saveJiraIncidentsConfig).not.toHaveBeenCalled();
  });

  it("saves the connection alone on first setup, then loads the Jira pickers", async () => {
    const fresh = {
      ...SAVED,
      configured: false,
      site_url: null,
      email: null,
      has_api_token: false,
      service_account_id: null,
      project_id: null,
      project_key: null,
      issue_type_id: null,
      default_project_id: null,
      default_type: null,
      default_reporter: null,
      readiness: { ready: false, reason: "Jira incidents isn't set up yet" },
    };
    repo.getJiraIncidentsConfig.mockResolvedValue(fresh);
    repo.saveJiraIncidentsConfig.mockResolvedValue({
      ...fresh,
      configured: true,
      site_url: "https://acme.atlassian.net",
      email: "svc@acme.co",
      has_api_token: true,
      readiness: { ready: false, reason: "Choose a Jira project" },
    });
    const { container } = renderPage();
    await screen.findByText("Save the connection to choose a Jira project.");
    expect(repo.getJiraProjects).not.toHaveBeenCalled();
    const field = (id: string) => container.querySelector(`#${id}`) as HTMLInputElement;
    fireEvent.change(field("jira-incidents-site-url"), {
      target: { value: "https://acme.atlassian.net" },
    });
    fireEvent.change(field("jira-incidents-email"), { target: { value: "svc@acme.co" } });
    fireEvent.change(field("jira-incidents-api-token"), { target: { value: "token-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(repo.saveJiraIncidentsConfig).toHaveBeenCalled());
    expect(repo.saveJiraIncidentsConfig.mock.calls[0][0]).toMatchObject({
      site_url: "https://acme.atlassian.net",
      email: "svc@acme.co",
      api_token: "token-1",
    });
    expect(repo.saveJiraIncidentsConfig.mock.calls[0][0]).not.toHaveProperty("project_id");
    await waitFor(() => expect(repo.getJiraProjects).toHaveBeenCalled());
  });

  it("does not ask for the token again after the server normalises the site URL", async () => {
    repo.saveJiraIncidentsConfig.mockResolvedValue(SAVED);
    const { container } = renderPage();
    await screen.findByText("High");
    await waitFor(() => expect(screen.getAllByText("To Do").length).toBeGreaterThan(0));
    const field = (id: string) => container.querySelector(`#${id}`) as HTMLInputElement;
    fireEvent.change(field("jira-incidents-site-url"), {
      target: { value: "https://acme.atlassian.net/jira/your-work" },
    });
    fireEvent.change(field("jira-incidents-api-token"), { target: { value: "token-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(repo.saveJiraIncidentsConfig).toHaveBeenCalledTimes(1));
    await screen.findByText("Settings saved.");
    expect(field("jira-incidents-site-url").value).toBe("https://acme.atlassian.net");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(repo.saveJiraIncidentsConfig).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByText("Enter the API token again after changing the site URL or email"),
    ).toBeNull();
  });

  it("shows the server's reason when save is refused", async () => {
    repo.saveJiraIncidentsConfig.mockRejectedValue({
      response: { message: "Bad Request", data: "Map every Jira status: 'Triage' aren't mapped" },
    });
    renderPage();
    await screen.findByText("High");
    await waitFor(() => expect(screen.getAllByText("To Do").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(repo.saveJiraIncidentsConfig).toHaveBeenCalled());
    expect(
      await screen.findByText("Map every Jira status: 'Triage' aren't mapped"),
    ).toBeInTheDocument();
  });

  it("wires the shared sync panel", async () => {
    renderPage();
    await waitFor(() => expect(panelProps).toHaveBeenCalled());
    const props = panelProps.mock.calls[panelProps.mock.calls.length - 1][0];
    expect(props).toMatchObject({ extensionKey: "jira-incidents", showSyncNow: false });
    expect(props.describeCompletedRun({ counts: { imported: 1 } })).toBe(
      "Sync completed: imported 1",
    );
  });

  it("shows the empty activity state", async () => {
    renderPage();
    expect(await screen.findByText("No sync activity yet")).toBeInTheDocument();
  });

  it("lists sync activity with links to the incident and the issue", async () => {
    repo.getJiraIncidentEvents.mockResolvedValue([
      {
        id: 1,
        kind: "conflict",
        detail: { winner: "jira", applied: "Closed", vw_status: "Investigating" },
        created_at: "2026-10-14T10:00:00.000Z",
        incident_id: 5,
        incident_code: "INC-5",
        jira_issue_key: "SEC-1",
        jira_url: "https://acme.atlassian.net/browse/SEC-1",
      },
    ]);
    renderPage();
    expect(
      await screen.findByText("Kept Closed; Investigating was overwritten"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "INC-5" })).toHaveAttribute(
      "href",
      "/ai-incident-managements?incidentId=5",
    );
    const issue = screen.getByRole("link", { name: "SEC-1" });
    expect(issue).toHaveAttribute("target", "_blank");
    expect(issue).toHaveAttribute("rel", "noopener noreferrer");
  });
});
