/**
 * RequestorApprovalModal — network-backed error states.
 *
 * The sibling RequestorApprovalModal.test.tsx mocks the approvalRequest
 * repository, so it never sees a real failure. This file drives the two list
 * endpoints through MSW, pairing with the approve/reject/authorization work on
 * Servers/controllers/approvalRequest.ctrl.ts.
 *
 * The contract is a swallow: `fetchRequestsData` logs through logEngine and
 * leaves both lists empty. Worth knowing while reading these — the two fetches
 * share one `try`, so a failure in the FIRST (pending-approvals) skips the
 * second entirely and both lists end up empty even though only one endpoint
 * actually failed.
 */

import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { server } from "../../../../../test/mocks/server";
import { approvalRequestErrors } from "../../../../../test/mocks/errorHandlers";

import RequestorApprovalModal from "../index";

const listsRespond = (rows: unknown[]) => [
  http.get("/api/approval-requests/pending-approvals", () => HttpResponse.json({ data: rows })),
  http.get("/api/approval-requests/my-requests", () => HttpResponse.json({ data: rows })),
];

describe("RequestorApprovalModal (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // Control: proves the empty-state assertions below are actually reporting
  // the failure and not just the modal's default rendering.
  it("lists the returned requests when both endpoints succeed", async () => {
    server.use(...listsRespond([{ id: 1, request_name: "Vendor review", status: "Pending" }]));

    renderWithProviders(<RequestorApprovalModal isOpen onClose={vi.fn()} onRefresh={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Vendor review")).toBeInTheDocument());
    expect(screen.queryByText("No approval requests found.")).not.toBeInTheDocument();
  });

  it("shows the empty state when pending-approvals is forbidden", async () => {
    server.use(approvalRequestErrors.pending.forbidden("Access denied"));

    renderWithProviders(<RequestorApprovalModal isOpen onClose={vi.fn()} onRefresh={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("No approval requests found.")).toBeInTheDocument(),
    );
  });

  it("shows the empty state when my-requests 500s", async () => {
    server.use(...listsRespond([]), approvalRequestErrors.serverError("Lookup failed"));

    renderWithProviders(<RequestorApprovalModal isOpen onClose={vi.fn()} onRefresh={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("No approval requests found.")).toBeInTheDocument(),
    );
  });

  it("shows the empty state on a transport failure", async () => {
    server.use(approvalRequestErrors.pending.transport());

    renderWithProviders(<RequestorApprovalModal isOpen onClose={vi.fn()} onRefresh={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("No approval requests found.")).toBeInTheDocument(),
    );
  });
});
