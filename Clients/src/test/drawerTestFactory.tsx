import React from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "./renderWithProviders";
import { vi } from "vitest";

// ============================================================================
// TYPES
// ============================================================================

export interface DrawerTestConfig {
  /** Component name for display */
  name: string;
  /** The drawer component */
  Component: React.ComponentType<any>;
  /** Required props for the component */
  props: Record<string, any>;
  /** Expected title text in header */
  titleMatcher?: string | RegExp;
  /** Close button label: "Close" typically, some use X icon */
  closeButtonLabel?: string;
  /** Custom function to find and click close button (for drawers without aria-label) */
  clickCloseButton?: () => void;
  /** Tab values to test switching */
  tabs?: string[];
  /** Evidence tab testid (defaults to "tab-evidence", NIST uses "tab-evidences") */
  evidenceTabTestId?: string;
  /** Whether the Details tab has RichTextEditor (needs mock) */
  hasRichTextEditor?: boolean;
  /** Whether the Details tab has Select fields */
  hasSelectFields?: boolean;
  /** Whether the Details tab has DatePicker */
  hasDatePicker?: boolean;
  /** Whether the Details tab has Field input */
  hasFieldInput?: boolean;
  /** Extra elements to verify in Details tab */
  extraDetailsChecks?: () => void;
  /** Skip save button test (if save is conditional) */
  skipSaveTest?: boolean;
  /** Custom save mock (defaults to vi.fn()) */
  saveMock?: ReturnType<typeof vi.fn>;
  /** Extra render options */
  preloadedAuth?: Record<string, any>;
  /** Custom mock setup before render */
  beforeRender?: () => void;
}

// ============================================================================
// COMMON MOCKS
// ============================================================================

const mockHandleAlert = vi.fn();
const mockGetEntityById = vi.fn();
const mockUpdateEntityById = vi.fn();
const mockAttachFilesToEntity = vi.fn();
const mockGetFileById = vi.fn();
const mockGetEntityFiles = vi.fn();
const mockGetAssessmentTopicById = vi.fn();
const mockUpdateEUAIActAnswerById = vi.fn();
const mockGetAnnexCategoriesById = vi.fn();
const mockUpdateAnnexCategoryById = vi.fn();
const mockISO27001GetSubClauseById = vi.fn();
const mockGetAnnexControlISO27001ById = vi.fn();

vi.mock("../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
    userId: 1,
  }),
}));

vi.mock("../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

vi.mock("../../application/repository/entity.repository", () => ({
  getEntityById: (...args: any[]) => mockGetEntityById(...args),
  updateEntityById: (...args: any[]) => mockUpdateEntityById(...args),
}));

vi.mock("../../application/repository/file.repository", () => ({
  getFileById: (...args: any[]) => mockGetFileById(...args),
  attachFilesToEntity: (...args: any[]) => mockAttachFilesToEntity(...args),
  getEntityFiles: (...args: any[]) => mockGetEntityFiles(...args),
}));

vi.mock("../../application/repository/question.repository", () => ({
  updateEUAIActAnswerById: (...args: any[]) => mockUpdateEUAIActAnswerById(...args),
}));

vi.mock("../../application/repository/assesment.repository", () => ({
  getAssessmentTopicById: (...args: any[]) => mockGetAssessmentTopicById(...args),
}));

vi.mock("../../application/repository/annexCategory_iso.repository", () => ({
  GetAnnexCategoriesById: (...args: any[]) => mockGetAnnexCategoriesById(...args),
  UpdateAnnexCategoryById: (...args: any[]) => mockUpdateAnnexCategoryById(...args),
}));

vi.mock("../../application/repository/subClause_iso.repository", () => ({
  ISO27001GetSubClauseById: (...args: any[]) => mockISO27001GetSubClauseById(...args),
}));

vi.mock("../../application/repository/annex_struct_iso.repository", () => ({
  GetAnnexControlISO27001ById: (...args: any[]) => mockGetAnnexControlISO27001ById(...args),
}));

vi.mock("../../application/tools/alertUtils", () => ({
  handleAlert: (...args: any[]) => mockHandleAlert(...args),
}));

// Mock Sub-components that render test-friendly output
vi.mock("../presentation/components/RichTextEditor", () => ({
  default: ({ initialContent, placeholder, onContentChange }: any) => (
    <div data-testid="rich-text-editor">
      <div data-testid="editor-initial">{initialContent}</div>
      <div data-testid="editor-placeholder">{placeholder}</div>
      <button data-testid="editor-change" onClick={() => onContentChange?.("test content")}>
        Change content
      </button>
    </div>
  ),
}));

vi.mock("../presentation/components/Inputs/Select", () => ({
  default: ({ id, label, value, onChange, items, placeholder, disabled }: any) => (
    <div data-testid={`select-${id}`}>
      <label>{label}</label>
      <select
        data-testid={`select-input-${id}`}
        value={value}
        onChange={(e) => onChange?.({ target: { value: e.target.value } } as any)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {items?.map((item: any) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock("../presentation/components/Inputs/Datepicker", () => ({
  default: ({ label, date, handleDateChange, disabled }: any) => (
    <div data-testid="date-picker">
      <label>{label}</label>
      <input
        data-testid="date-picker-input"
        type="date"
        value={date?.format?.("YYYY-MM-DD") || ""}
        onChange={() => handleDateChange?.({ format: () => "2025-01-15" } as any)}
        disabled={disabled}
      />
    </div>
  ),
}));

vi.mock("../presentation/components/Inputs/Field", () => ({
  default: ({ value, onChange, placeholder, disabled }: any) => (
    <div data-testid="field-input">
      <textarea
        data-testid="field-textarea"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  ),
}));

vi.mock("../presentation/components/TabBar", () => ({
  default: ({ tabs, activeTab, onChange }: any) => (
    <div data-testid="tab-bar">
      {tabs.map((tab: any) => (
        <button
          key={tab.value}
          data-testid={`tab-${tab.value}`}
          onClick={() => onChange?.(null, tab.value)}
          data-active={activeTab === tab.value ? "true" : "false"}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../presentation/components/button/customizable-button", () => ({
  CustomizableButton: ({ text, onClick, children, ariaLabel, isDisabled }: any) => (
    <button
      data-testid={`customizable-button-${text || ariaLabel || "unknown"}`}
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
    >
      {children || text}
    </button>
  ),
}));

vi.mock("../presentation/components/Notes/NotesTab", () => ({
  default: () => <div data-testid="notes-tab">Notes Tab</div>,
}));

vi.mock("../presentation/components/LinkedRisks", () => ({
  LinkedRisksPopup: () => <div data-testid="linked-risks-popup">Linked Risks</div>,
}));

vi.mock("../presentation/components/AddNewRiskForm", () => ({
  default: () => <div data-testid="add-new-risk-form">Add New Risk</div>,
}));

vi.mock("../presentation/components/Modals/StandardModal", () => ({
  default: ({ children, isOpen, title }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <div>{title}</div>
        {children}
      </div>
    ) : null,
}));

vi.mock("../presentation/components/FilePickerModal", () => ({
  FilePickerModal: ({ open }: any) =>
    open ? <div data-testid="file-picker-modal">File Picker</div> : null,
}));

vi.mock("../presentation/components/Alert", () => ({
  default: (props: any) => (
    <div data-testid="alert-toast" data-variant={props.variant}>
      {props.body}
    </div>
  ),
}));

vi.mock("../presentation/components/RiskPopup/AuditRiskPopup", () => ({
  default: () => <div data-testid="audit-risk-popup">Audit Risk</div>,
}));

vi.mock("../presentation/components/Inputs/ChipInput", () => ({
  default: () => <div data-testid="chip-input">Chip Input</div>,
}));

vi.mock("../presentation/components/Inputs/Checkbox", () => ({
  default: ({ label, checked, onChange }: any) => (
    <div data-testid="checkbox-input">
      <label>
        <input type="checkbox" checked={checked} onChange={onChange} />
        {label}
      </label>
    </div>
  ),
}));

// ============================================================================
// MOCK RESET HELPER
// ============================================================================

export function resetDrawerMocks() {
  mockGetEntityById.mockReset();
  mockUpdateEntityById.mockReset();
  mockAttachFilesToEntity.mockReset();
  mockGetFileById.mockReset();
  mockGetEntityFiles.mockReset();
  mockGetAssessmentTopicById.mockReset();
  mockUpdateEUAIActAnswerById.mockReset();
  mockGetAnnexCategoriesById.mockReset().mockResolvedValue({ data: {} });
  mockUpdateAnnexCategoryById.mockReset();
  mockISO27001GetSubClauseById.mockReset().mockResolvedValue({ data: {} });
  mockGetAnnexControlISO27001ById.mockReset().mockResolvedValue({ data: {} });
  mockHandleAlert.mockReset();
}

// ============================================================================
// EXPOSED HELPERS
// ============================================================================

export {
  mockGetEntityById,
  mockUpdateEntityById,
  mockUpdateEUAIActAnswerById,
  mockHandleAlert,
  mockGetAnnexCategoriesById,
  mockUpdateAnnexCategoryById,
  mockISO27001GetSubClauseById,
  mockGetAnnexControlISO27001ById,
};

// ============================================================================
// COMMON TESTS
// ============================================================================

export function runDrawerCommonTests(config: DrawerTestConfig) {
  const titleMatcher = config.titleMatcher!;
  const tabs = config.tabs!;
  const { name, Component, props, closeButtonLabel = "Close" } = config;

  describe(`${name} - Drawer Common Tests`, () => {
    beforeEach(() => {
      resetDrawerMocks();
      config.beforeRender?.();
    });

    it("renders drawer with title when open", () => {
      renderWithProviders(<Component {...props} open={true} />);
      expect(screen.getByText(titleMatcher)).toBeInTheDocument();
    });

    it("does not render when closed", () => {
      renderWithProviders(<Component {...props} open={false} />);
      expect(screen.queryByText(titleMatcher)).not.toBeInTheDocument();
    });

    it("renders title in header", () => {
      renderWithProviders(<Component {...props} open={true} />);
      expect(screen.getByText(titleMatcher)).toBeInTheDocument();
    });

    it("renders close button and calls onClose when clicked", () => {
      const onClose = vi.fn();
      renderWithProviders(<Component {...props} open={true} onClose={onClose} />);
      if (config.clickCloseButton) {
        config.clickCloseButton();
      } else {
        fireEvent.click(screen.getByLabelText(closeButtonLabel));
      }
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders all tabs in TabBar", () => {
      renderWithProviders(<Component {...props} open={true} />);
      tabs.forEach((tab) => {
        expect(screen.getByTestId(`tab-${tab}`)).toBeInTheDocument();
      });
    });

    it("switches tabs on click", () => {
      renderWithProviders(<Component {...props} open={true} />);
      for (let i = 1; i < tabs.length; i++) {
        const tab = screen.getByTestId(`tab-${tabs[i]}`);
        fireEvent.click(tab);
        expect(tab.getAttribute("data-active")).toBe("true");
      }
    });
  });
}

export function runDrawerDetailsTabTests(config: DrawerTestConfig) {
  const {
    name,
    Component,
    props,
    hasRichTextEditor = true,
    hasSelectFields = true,
    hasDatePicker = true,
    hasFieldInput = true,
    extraDetailsChecks,
  } = config;

  describe(`${name} - Details Tab`, () => {
    beforeEach(() => {
      resetDrawerMocks();
      config.beforeRender?.();
    });

    it("renders Details tab panel by default", () => {
      renderWithProviders(<Component {...props} open={true} />);
      expect(screen.getByTestId("tab-details")).toBeInTheDocument();
    });

    if (hasRichTextEditor) {
      it("renders RichTextEditor in Details tab", () => {
        renderWithProviders(<Component {...props} open={true} />);
        expect(screen.getByTestId("rich-text-editor")).toBeInTheDocument();
      });
    }

    if (hasSelectFields) {
      it("renders Select fields in Details tab", () => {
        renderWithProviders(<Component {...props} open={true} />);
        const selects = screen.getAllByTestId(/^select-/);
        expect(selects.length).toBeGreaterThan(0);
      });
    }

    if (hasDatePicker) {
      it("renders DatePicker in Details tab", () => {
        renderWithProviders(<Component {...props} open={true} />);
        expect(screen.getByTestId("date-picker")).toBeInTheDocument();
      });
    }

    if (hasFieldInput) {
      it("renders Field input in Details tab", () => {
        renderWithProviders(<Component {...props} open={true} />);
        expect(screen.getAllByTestId("field-input").length).toBeGreaterThanOrEqual(1);
      });
    }

    if (extraDetailsChecks) {
      it("passes extra Details tab checks", () => {
        renderWithProviders(<Component {...props} open={true} />);
        extraDetailsChecks();
      });
    }
  });
}

export function runDrawerEvidenceTabTests(config: DrawerTestConfig) {
  const { name, Component, props, evidenceTabTestId = "tab-evidence" } = config;

  describe(`${name} - Evidence Tab`, () => {
    beforeEach(() => {
      resetDrawerMocks();
      config.beforeRender?.();
    });

    it("renders evidence tab content", () => {
      renderWithProviders(<Component {...props} open={true} />);
      fireEvent.click(screen.getByTestId(evidenceTabTestId));
      expect(screen.getByText("Evidence files")).toBeInTheDocument();
    });
  });
}

export function runDrawerCrossMappingsTabTests(config: DrawerTestConfig) {
  const { name, Component, props } = config;

  describe(`${name} - Cross Mappings Tab`, () => {
    beforeEach(() => {
      resetDrawerMocks();
      config.beforeRender?.();
    });

    it("renders cross mappings tab content", () => {
      renderWithProviders(<Component {...props} open={true} />);
      fireEvent.click(screen.getByTestId("tab-cross-mappings"));
      expect(screen.getByRole("heading", { name: /linked risks/i })).toBeInTheDocument();
    });
  });
}

export function runDrawerNotesTabTests(config: DrawerTestConfig) {
  const { name, Component, props } = config;

  describe(`${name} - Notes Tab`, () => {
    beforeEach(() => {
      resetDrawerMocks();
      config.beforeRender?.();
    });

    it("renders notes tab content", () => {
      renderWithProviders(<Component {...props} open={true} />);
      fireEvent.click(screen.getByTestId("tab-notes"));
      expect(screen.getByTestId("notes-tab")).toBeInTheDocument();
    });
  });
}

export function runDrawerSaveTests(config: DrawerTestConfig) {
  const { name, Component, props, skipSaveTest } = config;

  if (skipSaveTest) return;

  describe(`${name} - Save Flow`, () => {
    beforeEach(() => {
      resetDrawerMocks();
      config.beforeRender?.();
    });

    it("renders save button", () => {
      renderWithProviders(<Component {...props} open={true} />);
      expect(screen.getByText("Save")).toBeInTheDocument();
    });
  });
}

// ============================================================================
// MASTER TEST RUNNER
// ============================================================================

export function runDrawerTests(config: DrawerTestConfig) {
  runDrawerCommonTests(config);
  runDrawerDetailsTabTests(config);
  runDrawerEvidenceTabTests(config);
  runDrawerCrossMappingsTabTests(config);
  runDrawerNotesTabTests(config);
  runDrawerSaveTests(config);
}
