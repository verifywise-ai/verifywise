import { runDrawerTests } from "../../../../../test/drawerTestFactory";
import VWISO27001AnnexDrawerDialog from "../index";

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
};

runDrawerTests({
  name: "VWISO27001AnnexDrawerDialog",
  Component: VWISO27001AnnexDrawerDialog,
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
