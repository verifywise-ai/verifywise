import { runDrawerTests } from "../../../../../test/drawerTestFactory";
import VWISO42001AnnexDrawerDialog from "../index";

const mockControl = {
  id: 1,
  control_no: 1,
  control_subSection: 1,
  title: "Test control",
  shortDescription: "Test description",
  guidance: "Test guidance",
  status: "Not started",
};

const mockAnnex = {
  id: undefined,
  is_applicable: true,
  justification_for_exclusion: "",
  implementation_description: "",
  evidence_links: [],
  status: "Not started" as const,
  owner: 0,
  reviewer: 0,
  approver: 0,
  due_date: new Date(),
  auditor_feedback: "",
  projects_frameworks_id: 1,
  annexcategory_meta_id: 1,
  created_at: new Date(),
};

runDrawerTests({
  name: "VWISO42001AnnexDrawerDialog",
  Component: VWISO42001AnnexDrawerDialog,
  props: {
    open: false,
    onClose: () => {},
    onSaveSuccess: () => {},
    title: "Test Annex Title",
    control: mockControl,
    annex: mockAnnex,
    projectFrameworkId: 1,
    project_id: 1,
  },
  titleMatcher: "Test Annex Title",
  tabs: ["details", "evidence", "cross-mappings", "notes"],
});
