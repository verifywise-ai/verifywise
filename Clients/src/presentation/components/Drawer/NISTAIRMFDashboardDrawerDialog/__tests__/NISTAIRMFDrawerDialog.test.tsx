import { screen, fireEvent } from "@testing-library/react";
import {
  runDrawerCommonTests,
  runDrawerDetailsTabTests,
  runDrawerEvidenceTabTests,
  runDrawerCrossMappingsTabTests,
  runDrawerNotesTabTests,
  runDrawerSaveTests,
} from "../../../../../test/drawerTestFactory";
import NISTAIRMFDrawerDialog from "../index";
import { NISTAIRMFStatus, NISTAIRMFFunction } from "../../../../pages/Framework/NIST-AI-RMF/types";

const mockCategory = {
  id: 1,
  title: "Govern",
  index: "1",
  description: "Test category",
  function: NISTAIRMFFunction.GOVERN,
};

const mockSubcategory = {
  id: 1,
  title: "Test Subcategory",
  index: "1",
  description: "Test description",
  status: NISTAIRMFStatus.NOT_STARTED,
  category_id: 1,
  implementation_description: "",
  owner: "",
  reviewer: "",
  approver: "",
  due_date: "",
  auditor_feedback: "",
  evidence_links: [],
  tags: [],
  category: mockCategory,
};

const baseProps = {
  open: false,
  onClose: () => {},
  onSaveSuccess: () => {},
  subcategory: mockSubcategory,
  category: mockCategory,
  function: NISTAIRMFFunction.GOVERN,
};

runDrawerCommonTests({
  name: "NISTAIRMFDrawerDialog",
  Component: NISTAIRMFDrawerDialog,
  props: baseProps,
  titleMatcher: "GOVERN 1.1",
  tabs: ["details", "evidences", "cross-mappings", "notes"],
  clickCloseButton: () => {
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find(
      (btn) => btn.querySelector("svg") && btn.closest("[class*='nist-ai-rmf-drawer-dialog']"),
    );
    if (closeBtn) fireEvent.click(closeBtn);
  },
});

runDrawerDetailsTabTests({
  name: "NISTAIRMFDrawerDialog",
  Component: NISTAIRMFDrawerDialog,
  props: baseProps,
});

runDrawerEvidenceTabTests({
  name: "NISTAIRMFDrawerDialog",
  Component: NISTAIRMFDrawerDialog,
  props: baseProps,
  evidenceTabTestId: "tab-evidences",
});

runDrawerCrossMappingsTabTests({
  name: "NISTAIRMFDrawerDialog",
  Component: NISTAIRMFDrawerDialog,
  props: baseProps,
});

runDrawerNotesTabTests({
  name: "NISTAIRMFDrawerDialog",
  Component: NISTAIRMFDrawerDialog,
  props: baseProps,
});

runDrawerSaveTests({
  name: "NISTAIRMFDrawerDialog",
  Component: NISTAIRMFDrawerDialog,
  props: baseProps,
});
