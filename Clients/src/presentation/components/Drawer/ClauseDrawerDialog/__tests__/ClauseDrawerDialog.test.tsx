import { runDrawerTests } from "../../../../../test/drawerTestFactory";
import ISO42001ClauseDrawerDialog from "../index";
import { ISO42001Status } from "../../../../pages/Framework/ISO42001/types";

const mockClause = {
  id: 1,
  clause_no: "4",
  title: "Context of the organization",
};

const mockSubclause = {
  id: 10,
  order_no: 1,
  title: "Understanding the organization",
  subclause_id: "4.1",
  summary: "Test summary",
  questions: ["Test question"],
  evidence_examples: ["Test evidence"],
  status: ISO42001Status.NOT_STARTED,
  implementation_description: "",
  owner: null,
  reviewer: null,
  approver: null,
  auditor_feedback: "",
};

runDrawerTests({
  name: "ISO42001ClauseDrawerDialog",
  Component: ISO42001ClauseDrawerDialog,
  props: {
    open: false,
    onClose: () => {},
    onSaveSuccess: () => {},
    clause: mockClause,
    subclause: mockSubclause,
    projectFrameworkId: 1,
    project_id: 1,
  },
  titleMatcher: "4.1 Understanding the organization",
  tabs: ["details", "evidence", "cross-mappings", "notes"],
});
