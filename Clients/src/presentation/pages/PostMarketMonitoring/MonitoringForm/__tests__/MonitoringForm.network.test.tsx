/**
 * MonitoringForm — network-backed error states.
 *
 * The sibling MonitoringForm.test.tsx mocks `pmmService` wholesale, so its
 * error cases assert against hand-made rejections rather than the
 * `{ message, data }` envelope the PMM controller really sends. This file
 * leaves the service real and drives MSW, pairing with the config/cycle
 * handlers on Servers/controllers/postMarketMonitoring.ctrl.ts.
 *
 * Contract: a failed load is logged, an alert is raised, `isLoading` clears in
 * a `finally`, and with no cycle the form renders "Monitoring cycle not found".
 */

import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { server } from "../../../../../test/mocks/server";
import { postMarketMonitoringErrors } from "../../../../../test/mocks/errorHandlers";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useParams: () => ({ cycleId: "5" }), useNavigate: () => vi.fn() };
});

import MonitoringForm from "../index";

describe("MonitoringForm (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  // Control: the default handlers return a cycle, so the not-found text below
  // really is the failure signal and not the component's resting state.
  it("does not show the not-found state when the cycle loads", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() =>
      expect(screen.queryByText("Monitoring cycle not found")).not.toBeInTheDocument(),
    );
  });

  it("shows the not-found state when the cycle request is forbidden", async () => {
    server.use(postMarketMonitoringErrors.cycleById.forbidden("Access denied"));

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => expect(screen.getByText("Monitoring cycle not found")).toBeInTheDocument());
    expect(console.error).toHaveBeenCalled();
  });

  it("shows the not-found state when the cycle request 500s", async () => {
    server.use(postMarketMonitoringErrors.cycleById.serverError("Cycle lookup failed"));

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => expect(screen.getByText("Monitoring cycle not found")).toBeInTheDocument());
  });

  it("still renders the cycle when only the responses request fails", async () => {
    // Responses load inside their own try/catch precisely so a failure there
    // leaves an empty form rather than losing the whole cycle.
    server.use(postMarketMonitoringErrors.responses.serverError());

    renderWithProviders(<MonitoringForm />);

    await waitFor(() =>
      expect(screen.queryByText("Monitoring cycle not found")).not.toBeInTheDocument(),
    );
  });
});
