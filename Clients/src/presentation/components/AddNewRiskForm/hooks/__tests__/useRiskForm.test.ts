import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import React from "react";
import { useRiskForm } from "../useRiskForm";
import { AddNewRiskFormProps } from "../../../../types/riskForm.types";
import authReducer from "../../../../../application/redux/auth/authSlice";
import uiReducer from "../../../../../application/redux/ui/uiSlice";
import fileReducer from "../../../../../application/redux/file/fileSlice";

const mockClosePopup = vi.fn();
const mockOnSuccess = vi.fn();
const mockOnError = vi.fn();
const mockOnLoading = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});

vi.mock("../../RiskLevel/constants", () => ({
  Likelihood: { Rare: 1, Unlikely: 2, Possible: 3, Likely: 4, AlmostCertain: 5 },
  Severity: { Negligible: 1, Minor: 2, Moderate: 3, Major: 4, Catastrophic: 5 },
}));

vi.mock("../../RiskLevel/riskValues", () => ({
  RiskLikelihood: { Rare: "Rare" },
  RiskSeverity: { Negligible: "Negligible" },
}));

vi.mock("../../projectRiskValue", () => ({
  aiLifecyclePhase: [{ _id: 1, name: "Phase 1" }],
  riskCategoryItems: [{ _id: 1, name: "Category 1" }],
  mitigationStatusItems: [{ _id: 1, name: "Not Started" }],
  riskLevelItems: [{ _id: 1, name: "Low" }],
  approvalStatusItems: [{ _id: 1, name: "Pending" }],
  likelihoodItems: [
    { _id: 1, name: "Rare" },
    { _id: 2, name: "Unlikely" },
  ],
  riskSeverityItems: [
    { _id: 1, name: "Negligible" },
    { _id: 2, name: "Minor" },
  ],
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  createProjectRisk: vi.fn(),
  updateProjectRisk: vi.fn(),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "Test", surname: "User" }], loading: false }),
}));

vi.mock("../../../../application/contexts/VerifyWise.context", () => ({
  VerifyWiseContext: {
    _currentValue: { inputValues: {} },
    Consumer: ({ children }: any) => children({ inputValues: {} }),
    Provider: ({ children, value }: any) =>
      React.createElement(
        React.Fragment,
        null,
        typeof children === "function" ? children(value) : children,
      ),
  },
}));

vi.mock("../../../../application/constants/permissions", () => ({
  default: {
    projectRisks: { edit: ["Admin"], create: ["Admin"] },
  },
}));

vi.mock("../../../tools/riskCalculator", () => ({
  RiskCalculator: {
    getRiskLevel: () => ({ level: "Low" }),
  },
}));

vi.mock("../../CustomFieldsSection/RequiredCustomFieldsGate", () => ({
  useRequiredCustomFieldsGate: () => ({ blocked: false, onPendingChange: () => {} }),
}));

vi.mock("../../QuantitativeRiskForm", () => ({
  default: () => null,
  quantitativeInitialState: {},
}));

vi.mock("../../../../application/hooks/useRiskAssessmentMode", () => ({
  useRiskAssessmentMode: () => ({ isQuantitative: false }),
}));

vi.mock("../useMitigationSection", () => ({
  useMitigationSection: (initial: any) => ({
    mitigationValues: initial || {},
    setMitigationValues: vi.fn(),
    originalMitigationValues: initial || {},
    setOriginalMitigationValues: vi.fn(),
    validateRef: { current: null },
    mapFromInputValues: vi.fn(() => ({})),
    buildBackendData: vi.fn(() => ({})),
  }),
  mitigationInitialState: {},
}));

function createTestStore() {
  return configureStore({
    reducer: combineReducers({
      auth: authReducer,
      ui: uiReducer,
      files: fileReducer,
    }),
    preloadedState: {
      auth: {
        isLoading: false,
        authToken: "",
        user: "",
        userExists: false,
        success: null,
        message: null,
        expirationDate: null,
        onboardingStatus: "completed",
        isOrgCreator: false,
        isSuperAdmin: false,
        activeOrganizationId: null,
      },
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

const createProps = (overrides: Partial<AddNewRiskFormProps> = {}): AddNewRiskFormProps => ({
  closePopup: mockClosePopup,
  onSuccess: mockOnSuccess,
  onError: mockOnError,
  onLoading: mockOnLoading,
  popupStatus: "new",
  ...overrides,
});

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const store = createTestStore();
  const queryClient = createTestQueryClient();
  return React.createElement(
    Provider,
    { store } as any,
    React.createElement(QueryClientProvider, { client: queryClient }, children),
  );
};

describe("useRiskForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with default tab value", () => {
    const { result } = renderHook(() => useRiskForm(createProps()), { wrapper: Wrapper });
    expect(result.current.value).toBe("risks");
  });

  it("changes tab value", () => {
    const { result } = renderHook(() => useRiskForm(createProps()), { wrapper: Wrapper });

    act(() => {
      result.current.handleTabChange({} as React.SyntheticEvent, "mitigation");
    });

    expect(result.current.value).toBe("mitigation");
  });

  it("returns correct permission flags for unauthenticated user", () => {
    const { result } = renderHook(() => useRiskForm(createProps()), { wrapper: Wrapper });

    expect(result.current.userRoleName).toBe("");
    expect(result.current.isEditingDisabled).toBe(true);
    expect(result.current.isCreatingDisabled).toBe(true);
  });

  it("exposes risk form submit handler", () => {
    const { result } = renderHook(() => useRiskForm(createProps()), { wrapper: Wrapper });
    expect(typeof result.current.riskFormSubmitHandler).toBe("function");
  });

  it("returns usersLoading as false when users are loaded", () => {
    const { result } = renderHook(() => useRiskForm(createProps()), { wrapper: Wrapper });
    expect(result.current.usersLoading).toBe(false);
  });
});
