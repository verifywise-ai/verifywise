import { act, renderHook } from "@testing-library/react";
import { useRequiredCustomFieldsGate } from "../RequiredCustomFieldsGate";

let mockMissing: Array<{ id: number; label: string }> = [];
let mockMissingLoading = false;
vi.mock("../../../../application/hooks/useCustomFields", () => ({
  useMissingRequiredCustomFields: () => ({ data: mockMissing, isLoading: mockMissingLoading }),
}));

describe("useRequiredCustomFieldsGate", () => {
  beforeEach(() => {
    mockMissing = [];
    mockMissingLoading = false;
  });

  it("is not blocked when nothing is missing", () => {
    const { result } = renderHook(() => useRequiredCustomFieldsGate("project", 1));
    expect(result.current.blocked).toBe(false);
  });

  it("unblocks once a missing field has a staged value", () => {
    mockMissing = [{ id: 1, label: "Data owner" }];
    const { result } = renderHook(() => useRequiredCustomFieldsGate("project", 1));
    expect(result.current.blocked).toBe(true);

    act(() => result.current.onPendingChange(new Set([1])));
    expect(result.current.blocked).toBe(false);
  });

  it("blocks when a stored required value is cleared", () => {
    const { result } = renderHook(() => useRequiredCustomFieldsGate("project", 1));

    act(() => result.current.onPendingChange(new Set(), [{ id: 2, label: "Data owner" }]));

    expect(result.current.blocked).toBe(true);
    expect(result.current.missingLabels).toEqual(["Data owner"]);
  });

  it("blocks on a cleared required value while the missing list is loading", () => {
    mockMissingLoading = true;
    const { result } = renderHook(() => useRequiredCustomFieldsGate("project", 1));

    act(() => result.current.onPendingChange(new Set(), [{ id: 2, label: "Data owner" }]));

    expect(result.current.blocked).toBe(true);
  });
});
