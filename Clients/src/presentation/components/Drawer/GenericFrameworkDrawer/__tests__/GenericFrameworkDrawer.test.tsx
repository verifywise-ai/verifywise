import { screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import {
  runDrawerTests,
  mockGetEntityById,
  mockUpdateEntityById,
} from "../../../../../test/drawerTestFactory";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { server } from "../../../../../test/mocks/server";
import GenericFrameworkDrawer from "../index";

const baseProps = {
  open: false,
  onClose: () => {},
  onSaveSuccess: () => {},
  title: "Test Framework Control",
  frameworkId: 2,
  frameworkType: "iso42001",
  entityType: "annex",
  level: "l2" as const,
  entityId: 10,
  projectFrameworkId: 1,
  project_id: 1,
  summary: "Test summary",
  questions: ["Question 1"],
  evidenceExamples: ["Example 1"],
  isOrganizational: false,
  notesAttachedTo: "generic-control",
};

function mockEntityResponses() {
  mockGetEntityById.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
    if (routeUrl.endsWith("/risks")) {
      return Promise.resolve({ data: [] });
    }
    return Promise.resolve({
      data: {
        status: "In progress",
        owner: 1,
        reviewer: 2,
        approver: 3,
        auditor_feedback: "",
        due_date: null,
        risks: [],
      },
    });
  });
  mockUpdateEntityById.mockResolvedValue({ status: 200, data: {} });
}

runDrawerTests({
  name: "GenericFrameworkDrawer",
  Component: GenericFrameworkDrawer,
  props: baseProps,
  titleMatcher: "Test Framework Control",
  tabs: ["details", "evidence", "cross-mappings", "notes"],
  beforeRender: mockEntityResponses,
});

// The factory's repository-level vi.mock doesn't reliably intercept the
// deep entity.repository -> apiServices call chain here (same limitation
// ISO27001ClauseDrawerDialog's tests hit) — assertions that actually await
// fetch/save behavior use MSW `server.use` instead, matching that file's
// convention. mockGetEntityById/mockUpdateEntityById below are still reset
// so the generic runDrawerTests() suite above doesn't leak state between runs.
describe("GenericFrameworkDrawer - framework-specific behavior", () => {
  beforeEach(() => {
    mockGetEntityById.mockReset();
    mockUpdateEntityById.mockReset();
    mockEntityResponses();
  });

  it("does not render the Notes tab when notesAttachedTo is not provided", () => {
    const { notesAttachedTo: _omit, ...propsWithoutNotes } = baseProps;
    renderWithProviders(<GenericFrameworkDrawer {...propsWithoutNotes} open={true} />);

    expect(screen.queryByTestId("tab-notes")).not.toBeInTheDocument();
  });

  it("fetches the impl record and its linked risks when opened", async () => {
    const implSpy = vi.fn();
    const risksSpy = vi.fn();
    server.use(
      http.get("/api/frameworks/2/impl/l2/10", () => {
        implSpy();
        return HttpResponse.json({
          data: { status: "In progress", owner: 1, reviewer: 2, approver: 3, risks: [] },
        });
      }),
      http.get("/api/frameworks/2/impl/l2/10/risks", () => {
        risksSpy();
        return HttpResponse.json({ data: [] });
      }),
    );

    renderWithProviders(<GenericFrameworkDrawer {...baseProps} open={true} />);

    await waitFor(() => {
      expect(implSpy).toHaveBeenCalled();
      expect(risksSpy).toHaveBeenCalled();
    });
  });

  it("does not fetch when there is no entityId", async () => {
    const implSpy = vi.fn();
    server.use(
      http.get("/api/frameworks/2/impl/l2/10", () => {
        implSpy();
        return HttpResponse.json({ data: {} });
      }),
    );

    renderWithProviders(<GenericFrameworkDrawer {...baseProps} entityId={0} open={true} />);

    // Give any (unwanted) effect a tick to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(implSpy).not.toHaveBeenCalled();
  });

  it("calls onSaveSuccess and shows a success alert after a successful save", async () => {
    server.use(
      http.get("/api/frameworks/2/impl/l2/10", () =>
        HttpResponse.json({ data: { status: "In progress", risks: [] } }),
      ),
      http.get("/api/frameworks/2/impl/l2/10/risks", () => HttpResponse.json({ data: [] })),
      http.patch("/api/frameworks/2/impl/l2/10", () => HttpResponse.json({ data: {} })),
    );
    const onSaveSuccess = vi.fn();
    renderWithProviders(
      <GenericFrameworkDrawer {...baseProps} open={true} onSaveSuccess={onSaveSuccess} />,
    );

    await waitFor(() => expect(screen.getByText("Save")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onSaveSuccess).toHaveBeenCalledWith(true, "Saved", 10);
    });
    expect(screen.getByTestId("alert-toast")).toHaveAttribute("data-variant", "success");
  });

  it("shows an error alert and calls onSaveSuccess(false, ...) when the save request fails", async () => {
    server.use(
      http.get("/api/frameworks/2/impl/l2/10", () =>
        HttpResponse.json({ data: { status: "In progress", risks: [] } }),
      ),
      http.get("/api/frameworks/2/impl/l2/10/risks", () => HttpResponse.json({ data: [] })),
      http.patch("/api/frameworks/2/impl/l2/10", () =>
        HttpResponse.json({ message: "Save rejected" }, { status: 500 }),
      ),
    );
    const onSaveSuccess = vi.fn();
    renderWithProviders(
      <GenericFrameworkDrawer {...baseProps} open={true} onSaveSuccess={onSaveSuccess} />,
    );

    await waitFor(() => expect(screen.getByText("Save")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onSaveSuccess).toHaveBeenCalledWith(false, "Save rejected");
    });
    expect(screen.getByTestId("alert-toast")).toHaveAttribute("data-variant", "error");
  });

  it("passes the given status options through to the details tab", () => {
    renderWithProviders(
      <GenericFrameworkDrawer
        {...baseProps}
        open={true}
        statusOptions={[{ id: "Custom", name: "Custom status" }]}
      />,
    );

    expect(screen.getByTestId("select-status")).toBeInTheDocument();
    expect(screen.getByText("Custom status")).toBeInTheDocument();
  });
});
