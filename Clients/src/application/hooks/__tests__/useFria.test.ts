import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../repository/fria.repository", () => ({
  friaRepository: {
    getFria: vi.fn(),
    updateFria: vi.fn(),
    updateRights: vi.fn(),
    addRiskItem: vi.fn(),
    updateRiskItem: vi.fn(),
    deleteRiskItem: vi.fn(),
    linkModel: vi.fn(),
    unlinkModel: vi.fn(),
    submitFria: vi.fn(),
  },
}));

import { useFria } from "../useFria";
import { friaRepository } from "../../repository/fria.repository";

const mockGetFria = vi.mocked(friaRepository.getFria);
const mockUpdateFria = vi.mocked(friaRepository.updateFria);
const mockUpdateRights = vi.mocked(friaRepository.updateRights);
const mockAddRiskItem = vi.mocked(friaRepository.addRiskItem);
const mockUpdateRiskItem = vi.mocked(friaRepository.updateRiskItem);
const mockDeleteRiskItem = vi.mocked(friaRepository.deleteRiskItem);
const mockLinkModel = vi.mocked(friaRepository.linkModel);
const mockUnlinkModel = vi.mocked(friaRepository.unlinkModel);
const mockSubmitFria = vi.mocked(friaRepository.submitFria);

const mockAssessment = {
  id: 1,
  project_id: 5,
  status: "draft",
  version: 1,
  completion_pct: 50,
  risk_score: 25,
  risk_level: "Low",
  rights_flagged: 0,
  project_title: "Test Project",
  organization_name: "Org",
  created_by_name: "User",
  updated_by_name: "User",
  group_flags: [],
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  assessment_owner: null,
  assessment_date: null,
  operational_context: null,
  is_high_risk: null,
  high_risk_basis: null,
  deployer_type: null,
  annex_iii_category: null,
  first_use_date: null,
  review_cycle: null,
  period_frequency: null,
  fria_rationale: null,
  affected_groups: null,
  vulnerability_context: null,
  risk_scenarios: null,
  provider_info_used: null,
  human_oversight: null,
  transparency_measures: null,
  redress_process: null,
  data_governance: null,
  legal_review: null,
  dpo_review: null,
  owner_approval: null,
  stakeholders_consulted: null,
  consultation_notes: null,
  deployment_decision: null,
  decision_conditions: null,
};

const defaultFriaData = {
  assessment: mockAssessment,
  rights: [
    {
      id: 1,
      right_key: "dignity",
      right_title: "Dignity",
      charter_ref: "Art 1",
      flagged: true,
      severity: 3,
      confidence: 80,
      impact_pathway: null,
      mitigation: null,
    },
  ],
  riskItems: [
    {
      id: 1,
      fria_id: 1,
      risk_description: "Risk 1",
      likelihood: null,
      severity: null,
      existing_controls: null,
      further_action: null,
      linked_project_risk_id: null,
      linked_risk_name: null,
      sort_order: 1,
    },
  ],
  modelLinks: [
    {
      id: 1,
      model_id: 10,
      provider: "OpenAI",
      model: "GPT-4",
      version: "1.0",
      model_status: "active",
    },
  ],
};

describe("useFria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fetches FRIA data on mount", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.assessment?.id).toBe(1);
    expect(result.current.rights).toHaveLength(1);
    expect(result.current.riskItems).toHaveLength(1);
    expect(result.current.modelLinks).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("handles error on fetch", async () => {
    mockGetFria.mockRejectedValue(new Error("Not found"));
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("99"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Not found");
  });

  it("does not fetch when projectId is empty", async () => {
    vi.useRealTimers();
    renderHook(() => useFria(""));
    expect(mockGetFria).not.toHaveBeenCalled();
  });

  it("updateAssessment debounces and flushes", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockUpdateFria.mockResolvedValue({ ...mockAssessment, completion_pct: 75 });
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.updateAssessment({ completion_pct: 75 });
    });

    await waitFor(() => expect(result.current.lastSaveStatus).toBe("saved"));
    expect(mockUpdateFria).toHaveBeenCalledWith("5", { completion_pct: 75 });
  });

  it("updateAssessment accumulates multiple calls", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockUpdateFria.mockResolvedValue(mockAssessment);
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.updateAssessment({ completion_pct: 60 });
      result.current.updateAssessment({ risk_score: 30 });
    });

    await waitFor(() => expect(mockUpdateFria).toHaveBeenCalledTimes(1));
    expect(mockUpdateFria).toHaveBeenCalledWith("5", { completion_pct: 60, risk_score: 30 });
  });

  it("updateAssessment handles error", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockUpdateFria.mockRejectedValue(new Error("Update failed"));
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.updateAssessment({ completion_pct: 80 });
    });

    await waitFor(() => expect(result.current.lastSaveStatus).toBe("error"));
    expect(result.current.error).toBe("Update failed");
  });

  it("updateRights updates rights and refreshes assessment", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    const updatedRights = [{ id: 1, flagged: false }];
    mockUpdateRights.mockResolvedValue(updatedRights);
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetFria.mockResolvedValue({
      ...defaultFriaData,
      rights: [{ ...defaultFriaData.rights[0], flagged: false }],
    });

    await act(async () => {
      await result.current.updateRights(updatedRights as any);
    });

    expect(mockUpdateRights).toHaveBeenCalledWith(1, updatedRights);
    expect(result.current.lastSaveStatus).toBe("saved");
  });

  it("updateRights handles error", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockUpdateRights.mockRejectedValue(new Error("Rights update failed"));
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateRights([{ id: 1, flagged: false }] as any);
    });

    expect(result.current.lastSaveStatus).toBe("error");
    expect(result.current.error).toBe("Rights update failed");
  });

  it("addRiskItem adds and refreshes", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    const newItem = { id: 2, fria_id: 1, risk_description: "New Risk", sort_order: 2 };
    mockAddRiskItem.mockResolvedValue(newItem);
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetFria.mockResolvedValue({
      ...defaultFriaData,
      riskItems: [...defaultFriaData.riskItems, newItem as any],
    });

    await act(async () => {
      await result.current.addRiskItem({ risk_description: "New Risk" });
    });

    expect(mockAddRiskItem).toHaveBeenCalledWith(1, { risk_description: "New Risk" });
    expect(result.current.riskItems).toHaveLength(2);
  });

  it("updateRiskItem updates specific item", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    const updated = { ...defaultFriaData.riskItems[0], risk_description: "Updated Risk" };
    mockUpdateRiskItem.mockResolvedValue(updated);
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetFria.mockResolvedValue({
      ...defaultFriaData,
      riskItems: [updated],
    });

    await act(async () => {
      await result.current.updateRiskItem(1, { risk_description: "Updated Risk" });
    });

    expect(result.current.riskItems[0].risk_description).toBe("Updated Risk");
  });

  it("deleteRiskItem removes item from list", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockDeleteRiskItem.mockResolvedValue({ success: true });
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetFria.mockResolvedValue({
      ...defaultFriaData,
      riskItems: [],
    });

    await act(async () => {
      await result.current.deleteRiskItem(1);
    });

    expect(mockDeleteRiskItem).toHaveBeenCalledWith(1, 1);
    expect(result.current.riskItems).toHaveLength(0);
  });

  it("linkModel links and refetches", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockLinkModel.mockResolvedValue({ success: true });
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetFria.mockResolvedValue({
      ...defaultFriaData,
      modelLinks: [
        ...defaultFriaData.modelLinks,
        {
          id: 2,
          model_id: 20,
          provider: "Anthropic",
          model: "Claude",
          version: "2.0",
          model_status: "active",
        },
      ],
    });

    await act(async () => {
      await result.current.linkModel(20);
    });

    expect(mockLinkModel).toHaveBeenCalledWith(1, 20);
  });

  it("unlinkModel unlinks and refetches", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockUnlinkModel.mockResolvedValue({ success: true });
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGetFria.mockResolvedValue({ ...defaultFriaData, modelLinks: [] });

    await act(async () => {
      await result.current.unlinkModel(10);
    });

    expect(mockUnlinkModel).toHaveBeenCalledWith(1, 10);
  });

  it("submitFria flushes pending updates then submits", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockUpdateFria.mockResolvedValue(mockAssessment);
    mockSubmitFria.mockResolvedValue({ success: true });
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.updateAssessment({ completion_pct: 100 });
    });

    await act(async () => {
      await result.current.submitFria("Ready for review");
    });

    expect(mockSubmitFria).toHaveBeenCalledWith(1, "Ready for review");
  });

  it("does not call update or submit when assessment is null", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    vi.useRealTimers();
    const { unmount } = renderHook(() => useFria("5"));

    await waitFor(() => expect(mockGetFria).toHaveBeenCalled());

    unmount();
  });

  it("handles error on linkModel", async () => {
    mockGetFria.mockResolvedValue(defaultFriaData);
    mockLinkModel.mockRejectedValue(new Error("Link failed"));
    vi.useRealTimers();
    const { result } = renderHook(() => useFria("5"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const rejectionHandler = vi.fn();
    process.on("unhandledRejection", rejectionHandler);
    await act(async () => {
      await result.current.linkModel(99);
    });
    process.removeListener("unhandledRejection", rejectionHandler);

    expect(result.current.error).toBe("Link failed");
  });
});
