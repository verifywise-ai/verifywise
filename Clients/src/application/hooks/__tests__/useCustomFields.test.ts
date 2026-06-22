import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useCustomFieldDefinitions,
  useCreateCustomFieldDefinition,
  useUpdateCustomFieldDefinition,
  useDeleteCustomFieldDefinition,
  useCustomFieldValues,
  useMissingRequiredCustomFields,
} from "../useCustomFields";

vi.mock("../../repository/customField.repository", () => ({
  listCustomFieldDefinitions: vi.fn(),
  createCustomFieldDefinition: vi.fn(),
  updateCustomFieldDefinition: vi.fn(),
  deleteCustomFieldDefinition: vi.fn(),
  getCustomFieldValuesForEntity: vi.fn(),
  getMissingRequiredCustomFields: vi.fn(),
}));

import {
  listCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition,
  getCustomFieldValuesForEntity,
  getMissingRequiredCustomFields,
} from "../../repository/customField.repository";

const mockListDefinitions = vi.mocked(listCustomFieldDefinitions);
const mockCreateDefinition = vi.mocked(createCustomFieldDefinition);
const mockUpdateDefinition = vi.mocked(updateCustomFieldDefinition);
const mockDeleteDefinition = vi.mocked(deleteCustomFieldDefinition);
const mockGetValues = vi.mocked(getCustomFieldValuesForEntity);
const mockGetMissing = vi.mocked(getMissingRequiredCustomFields);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useCustomFieldDefinitions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns definitions for entity type", async () => {
    mockListDefinitions.mockResolvedValue([{ id: 1, label: "Field A" }] as any);
    const { result } = renderHook(() => useCustomFieldDefinitions("project"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, label: "Field A" }]);
    expect(mockListDefinitions).toHaveBeenCalledWith({
      entityType: "project",
      signal: expect.any(AbortSignal),
    });
  });
});

describe("useCustomFieldValues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns values when entityId is provided", async () => {
    mockGetValues.mockResolvedValue([{ value: "test" }] as any);
    const { result } = renderHook(() => useCustomFieldValues("project", 1), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ value: "test" }]);
  });

  it("is disabled when entityId is null", () => {
    const { result } = renderHook(() => useCustomFieldValues("project", null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useMissingRequiredCustomFields", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns missing fields when entityId is provided", async () => {
    mockGetMissing.mockResolvedValue([{ id: 1, field_key: "req_field", label: "Required" }] as any);
    const { result } = renderHook(() => useMissingRequiredCustomFields("project", 1), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, field_key: "req_field", label: "Required" }]);
  });

  it("is disabled when entityId is null", () => {
    const { result } = renderHook(() => useMissingRequiredCustomFields("project", null), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useCreateCustomFieldDefinition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls createCustomFieldDefinition with body", async () => {
    mockCreateDefinition.mockResolvedValue({ id: 1, entity_type: "project" } as any);
    const { result } = renderHook(() => useCreateCustomFieldDefinition(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      entity_type: "project",
      field_key: "test",
      label: "Test",
    } as any);
    expect(mockCreateDefinition).toHaveBeenCalledWith({
      entity_type: "project",
      field_key: "test",
      label: "Test",
    });
  });
});

describe("useUpdateCustomFieldDefinition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls updateCustomFieldDefinition with id and body", async () => {
    mockUpdateDefinition.mockResolvedValue({} as any);
    const { result } = renderHook(() => useUpdateCustomFieldDefinition("project"), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ id: 1, body: { label: "Updated" } } as any);
    expect(mockUpdateDefinition).toHaveBeenCalledWith({ id: 1, body: { label: "Updated" } });
  });
});

describe("useDeleteCustomFieldDefinition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls deleteCustomFieldDefinition with id", async () => {
    mockDeleteDefinition.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteCustomFieldDefinition("project"), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync(1);
    expect(mockDeleteDefinition).toHaveBeenCalledWith(1);
  });
});
