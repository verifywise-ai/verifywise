import { screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { server } from "../../../../../test/mocks/server";
import {
  runDrawerCommonTests,
  runDrawerDetailsTabTests,
  runDrawerEvidenceTabTests,
  runDrawerCrossMappingsTabTests,
  runDrawerSaveTests,
  resetDrawerMocks,
} from "../../../../../test/drawerTestFactory";
import VWISO27001ClauseDrawerDialog from "../index";

const mockClause = {
  id: 1,
  title: "Context of the organization",
  order_no: 4,
  clause_no: 4,
};

const mockSubClause = {
  id: undefined,
  title: "Understanding the organization",
  status: "0",
  implementation_description: "",
  owner: undefined,
  reviewer: undefined,
  approver: undefined,
  auditor_feedback: "",
  evidence_links: [],
  risks: [],
};

const baseProps = {
  open: false,
  onClose: () => {},
  onSaveSuccess: () => {},
  subClause: mockSubClause,
  clause: mockClause,
  projectFrameworkId: 1,
  project_id: 1,
  index: 0,
};

runDrawerCommonTests({
  name: "VWISO27001ClauseDrawerDialog",
  Component: VWISO27001ClauseDrawerDialog,
  props: baseProps,
  titleMatcher: /4\.1 Understanding the organization/,
  tabs: ["details", "evidence", "cross-mappings", "notes"],
});

runDrawerDetailsTabTests({
  name: "VWISO27001ClauseDrawerDialog",
  Component: VWISO27001ClauseDrawerDialog,
  props: baseProps,
});

runDrawerEvidenceTabTests({
  name: "VWISO27001ClauseDrawerDialog",
  Component: VWISO27001ClauseDrawerDialog,
  props: baseProps,
});

runDrawerCrossMappingsTabTests({
  name: "VWISO27001ClauseDrawerDialog",
  Component: VWISO27001ClauseDrawerDialog,
  props: baseProps,
});

runDrawerSaveTests({
  name: "VWISO27001ClauseDrawerDialog",
  Component: VWISO27001ClauseDrawerDialog,
  props: baseProps,
});

describe("VWISO27001ClauseDrawerDialog - Notes Tab", () => {
  beforeEach(() => {
    resetDrawerMocks();
    server.use(
      http.get("/api/iso-27001/subClause/byId/:id", () =>
        HttpResponse.json({
          data: {
            id: 10,
            title: "Understanding the organization",
            status: "0",
            implementation_description: "",
            evidence_links: [],
            risks: [],
          },
        }),
      ),
    );
  });

  it("renders notes tab content", async () => {
    renderWithProviders(
      <VWISO27001ClauseDrawerDialog
        {...baseProps}
        open={true}
        subClause={{ ...mockSubClause, id: 10 }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("tab-notes")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("tab-notes"));
    await waitFor(() => {
      expect(screen.getByTestId("notes-tab")).toBeInTheDocument();
    });
  });
});
