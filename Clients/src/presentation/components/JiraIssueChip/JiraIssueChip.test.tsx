import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material";
import { light } from "../../themes";
import JiraIssueChip from "./index";
import type {
  JiraIncidentLink,
  LinkState,
} from "../../../application/repository/jiraIncidents.repository";

const link = (state: LinkState, state_reason: string | null = null): JiraIncidentLink => ({
  incident_id: 1,
  jira_issue_key: "SEC-42",
  jira_url: "https://acme.atlassian.net/browse/SEC-42",
  state,
  state_reason,
});
const renderChip = (l: JiraIncidentLink) =>
  render(
    <ThemeProvider theme={light}>
      <JiraIssueChip link={l} />
    </ThemeProvider>,
  );

describe("JiraIssueChip", () => {
  it("links to the issue in a new tab", () => {
    renderChip(link("ok"));
    const a = screen.getByRole("link", { name: "Open SEC-42 in Jira" });
    expect(a).toHaveAttribute("href", "https://acme.atlassian.net/browse/SEC-42");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByTestId("jira-chip-badge")).toBeNull();
  });

  it("shows a badge and the reason on keyboard focus for errors", async () => {
    renderChip(link("error", "Jira status 'Awaiting vendor' isn't mapped"));
    expect(screen.getByTestId("jira-chip-badge")).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole("link")).toHaveFocus();
    expect(
      await screen.findByText("Sync error: Jira status 'Awaiting vendor' isn't mapped"),
    ).toBeInTheDocument();
  });

  it("labels a conflict without a reason", async () => {
    renderChip(link("conflict"));
    await userEvent.tab();
    expect(screen.getByRole("link")).toHaveFocus();
    expect(await screen.findByText("Conflict")).toBeInTheDocument();
  });

  it("does not open the row it sits in", () => {
    let rowClicks = 0;
    render(
      <ThemeProvider theme={light}>
        <div onClick={() => rowClicks++}>
          <JiraIssueChip link={link("ok")} />
        </div>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(rowClicks).toBe(0);
  });

  it("renders nothing for deleted_in_verifywise", () => {
    const { container } = renderChip(link("deleted_in_verifywise"));
    expect(container).toBeEmptyDOMElement();
  });
});
