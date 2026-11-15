import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "@mui/material";
import { MemoryRouter, useLocation } from "react-router";
import { light } from "../../../../themes";
import { SLACK_OAUTH_STATE_KEY } from "../slackOAuthState";

vi.mock("../../../../../application/hooks/useFormattedDate", () => ({
  default: () => () => "14-11-2026",
}));

const repo = vi.hoisted(() => ({
  getSlackConnections: vi.fn(),
  getUnlinkedSlackConnections: vi.fn(),
  connectSlackWorkspace: vi.fn(),
  updateSlackConnection: vi.fn(),
  deleteSlackConnection: vi.fn(),
  deleteUnlinkedSlackConnection: vi.fn(),
}));
vi.mock("../../../../../application/repository/slack.repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...repo,
}));

import SlackConfiguration from "../SlackConfiguration";

const GENERAL = {
  id: 1,
  team_name: "Acme",
  channel: "#general",
  created_at: "2026-11-01T00:00:00Z",
  is_active: true,
  routing_type: ["Membership and roles"],
  delivery_scope: "organization" as const,
};
const ALERTS = {
  id: 2,
  team_name: "Acme",
  channel: "alerts",
  created_at: "2026-11-02T00:00:00Z",
  is_active: true,
  routing_type: ["Evidence and task alerts"],
  delivery_scope: "organization" as const,
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

const renderPage = (route = "/extensions/slack/settings") =>
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[route]}>
        <ThemeProvider theme={light}>
          <SlackConfiguration />
          <LocationDisplay />
        </ThemeProvider>
      </MemoryRouter>
    </StrictMode>,
  );

/** An apiServices error with the server's reason in the response body. */
const apiError = (reason: string) =>
  Object.assign(new Error("Bad Request"), { response: { data: reason } });

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
  repo.getSlackConnections.mockResolvedValue([GENERAL, ALERTS]);
  repo.getUnlinkedSlackConnections.mockResolvedValue([]);
  repo.connectSlackWorkspace.mockResolvedValue(undefined);
  repo.updateSlackConnection.mockResolvedValue(undefined);
  repo.deleteSlackConnection.mockResolvedValue(undefined);
  repo.deleteUnlinkedSlackConnection.mockResolvedValue(undefined);
  sessionStorage.clear();
});

describe("OAuth return", () => {
  it("sends the code once when the state matches, then clears the URL", async () => {
    sessionStorage.setItem(SLACK_OAUTH_STATE_KEY, "state-1");
    renderPage("/extensions/slack/settings?code=code-1&state=state-1");

    expect(await screen.findByText("Slack connected.")).toBeInTheDocument();
    expect(repo.connectSlackWorkspace).toHaveBeenCalledTimes(1);
    expect(repo.connectSlackWorkspace).toHaveBeenCalledWith("code-1");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/extensions\/slack\/settings$/);
    expect(sessionStorage.getItem(SLACK_OAUTH_STATE_KEY)).toBeNull();
  });

  it("handles the return once under StrictMode: no false verification error while sending", async () => {
    sessionStorage.setItem(SLACK_OAUTH_STATE_KEY, "state-1");
    repo.connectSlackWorkspace.mockReturnValue(new Promise(() => {}));
    renderPage("/extensions/slack/settings?code=code-1&state=state-1");

    expect(await screen.findByText("Connecting Slack...")).toBeInTheDocument();
    expect(screen.queryByText(/could not be verified/)).not.toBeInTheDocument();
    expect(repo.connectSlackWorkspace).toHaveBeenCalledTimes(1);
  });

  it("refuses a state that does not match", async () => {
    sessionStorage.setItem(SLACK_OAUTH_STATE_KEY, "state-1");
    renderPage("/extensions/slack/settings?code=code-1&state=other");

    expect(await screen.findByText(/could not be verified/)).toBeInTheDocument();
    expect(repo.connectSlackWorkspace).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/extensions\/slack\/settings$/);
  });

  it("refuses a return without a state", async () => {
    sessionStorage.setItem(SLACK_OAUTH_STATE_KEY, "state-1");
    renderPage("/extensions/slack/settings?code=code-1");

    expect(await screen.findByText(/could not be verified/)).toBeInTheDocument();
    expect(repo.connectSlackWorkspace).not.toHaveBeenCalled();
  });

  it("reports a cancelled request without calling the server", async () => {
    sessionStorage.setItem(SLACK_OAUTH_STATE_KEY, "state-1");
    renderPage("/extensions/slack/settings?error=access_denied&state=state-1");

    expect(await screen.findByText(/the request was cancelled/)).toBeInTheDocument();
    expect(repo.connectSlackWorkspace).not.toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/extensions\/slack\/settings$/);
    expect(sessionStorage.getItem(SLACK_OAUTH_STATE_KEY)).toBeNull();
  });

  it("shows the server's reason when Slack refuses the code", async () => {
    sessionStorage.setItem(SLACK_OAUTH_STATE_KEY, "state-1");
    repo.connectSlackWorkspace.mockRejectedValue(
      apiError("Slack did not accept the authorization code. Add Slack again."),
    );
    renderPage("/extensions/slack/settings?code=code-1&state=state-1");

    expect(
      await screen.findByText("Slack did not accept the authorization code. Add Slack again."),
    ).toBeInTheDocument();
    expect(repo.connectSlackWorkspace).toHaveBeenCalledTimes(1);
  });
});

describe("connections", () => {
  it("asks for confirmation before removing a connection", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove #general" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove Slack connection?")).toBeInTheDocument();
    expect(
      within(dialog).getByText("#general in Acme stops receiving VerifyWise notifications."),
    ).toBeInTheDocument();
    expect(repo.deleteSlackConnection).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(repo.deleteSlackConnection).toHaveBeenCalledWith(1));
    expect(await screen.findByText("Connection removed.")).toBeInTheDocument();
  });

  it("does not remove anything when the confirmation is cancelled", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove #general" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(repo.deleteSlackConnection).not.toHaveBeenCalled();
  });

  it("preselects the connection's routing and saves it for that connection only", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit routing for #general" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: "Membership and roles" })).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: "Evidence and task alerts" }),
    ).not.toBeChecked();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Evidence and task alerts" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(repo.updateSlackConnection).toHaveBeenCalledTimes(1);
    expect(repo.updateSlackConnection).toHaveBeenCalledWith(1, {
      routing_type: ["Membership and roles", "Evidence and task alerts"],
    });
    expect(await screen.findByText("Notification routing saved.")).toBeInTheDocument();
  });

  it("keeps the routing dialog open with the error when the save fails", async () => {
    repo.updateSlackConnection.mockRejectedValue(
      apiError("routing_type must be a list of notification types"),
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit routing for #alerts" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("routing_type must be a list of notification types"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(repo.updateSlackConnection).toHaveBeenCalledWith(2, {
      routing_type: ["Evidence and task alerts"],
    });
  });

  it("turns a connection off from a labelled button", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Turn off #general" }));

    await waitFor(() =>
      expect(repo.updateSlackConnection).toHaveBeenCalledWith(1, { is_active: false }),
    );
    expect(await screen.findByText("Connection turned off.")).toBeInTheDocument();
  });

  it("notes that a legacy connection only posts its owner's events", async () => {
    repo.getSlackConnections.mockResolvedValue([{ ...GENERAL, delivery_scope: "user" }]);
    renderPage();

    expect(
      await screen.findByText("Posts only its owner's events until you save its routing."),
    ).toBeInTheDocument();
  });
});

describe("unlinked connections", () => {
  it("is hidden when there are none", async () => {
    renderPage();
    await screen.findByText("#general");
    expect(screen.queryByText("Unlinked connections")).not.toBeInTheDocument();
  });

  it("lists them and removes one after confirmation", async () => {
    let removed = false;
    repo.getUnlinkedSlackConnections.mockImplementation(async () =>
      removed ? [] : [{ id: 9, team_name: "Old team", channel: "#legacy" }],
    );
    repo.deleteUnlinkedSlackConnection.mockImplementation(async () => {
      removed = true;
    });
    renderPage();

    expect(await screen.findByText("Unlinked connections")).toBeInTheDocument();
    expect(screen.getByText("Old team")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove #legacy" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("This removes #legacy in Old team. It sends nothing now."),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(repo.deleteUnlinkedSlackConnection).toHaveBeenCalledWith(9));
    expect(repo.deleteSlackConnection).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Unlinked connections")).not.toBeInTheDocument());
  });
});
