/**
 * Automations page — network-backed error states.
 *
 * The sibling Automations.test.tsx mocks the whole automations repository AND
 * the AutomationList child, so it can never observe what the page does when the
 * API fails. This file leaves the repository and the list real and drives the
 * failures through MSW.
 *
 * The contract being pinned is the one the page actually implements
 * (Automations/index.tsx `fetchAutomations`): a failed load is logged, the list
 * is reset to empty, and `isLoading` is cleared in a `finally`. There is no
 * error banner — so these assert the empty state resolves, which is the real
 * regression guard: without the `finally`, the page spins forever.
 */

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { server } from "../../../../test/mocks/server";
import { automationsErrors } from "../../../../test/mocks/errorHandlers";

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));

vi.mock("../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="breadcrumbs" />,
}));

import AutomationsPage from "../index";

describe("AutomationsPage (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // Control: without this, every assertion below would pass just as happily
  // against a success response that happened to return nothing.
  it("renders the returned automations when the request succeeds", async () => {
    renderWithProviders(<AutomationsPage />);

    await waitFor(() => expect(screen.getByText("Daily Report")).toBeInTheDocument());
    expect(screen.queryByText("No automations yet")).not.toBeInTheDocument();
  });

  it("settles into the empty state when the list request 500s", async () => {
    server.use(automationsErrors.serverError());

    renderWithProviders(<AutomationsPage />);

    // The important part is that loading RESOLVES: the catch sets an empty
    // list and the finally clears isLoading. A regression in either leaves
    // the skeleton on screen forever.
    await waitFor(() => expect(screen.getByText("No automations yet")).toBeInTheDocument());
    expect(console.error).toHaveBeenCalled();
  });

  it("settles into the empty state when the list request is forbidden", async () => {
    server.use(automationsErrors.forbidden());

    renderWithProviders(<AutomationsPage />);

    await waitFor(() => expect(screen.getByText("No automations yet")).toBeInTheDocument());
  });

  it("settles into the empty state on a transport failure", async () => {
    server.use(automationsErrors.transport());

    renderWithProviders(<AutomationsPage />);

    await waitFor(() => expect(screen.getByText("No automations yet")).toBeInTheDocument());
  });

  it("settles into the empty state when the triggers request fails", async () => {
    // The load fans out to several endpoints; a failure in any one of them
    // must land in the same catch, not escape as an unhandled rejection.
    server.use(automationsErrors.triggers.serverError());

    renderWithProviders(<AutomationsPage />);

    await waitFor(() => expect(screen.getByText("No automations yet")).toBeInTheDocument());
    expect(console.error).toHaveBeenCalled();
  });
});
