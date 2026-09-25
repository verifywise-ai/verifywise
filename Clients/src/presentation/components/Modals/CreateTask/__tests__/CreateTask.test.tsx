import { vi } from "vitest";
import { act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  usersState: {
    users: [{ id: 2, name: "Mohammad", surname: "K", email: "m@test.com" }] as any[],
  },
  lastLinkProps: { current: null as any },
}));

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => <input data-testid={`field-${props.id || "field"}`} />,
}));
vi.mock("../../../Inputs/Datepicker", () => ({
  default: () => <div data-testid="datepicker" />,
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div data-testid="select" />,
}));
vi.mock("../../../Inputs/ChipInput", () => ({
  default: () => <div data-testid="chip-input" />,
}));
vi.mock("../../../EntityLinkSelector", () => ({
  default: (props: any) => {
    mocks.lastLinkProps.current = props;
    return <div data-testid="entity-link-selector" />;
  },
}));
vi.mock("../../../TabBar", () => ({
  default: () => <div data-testid="tab-bar" />,
}));
vi.mock("../../../HistorySidebar", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mocks.usersState.users }),
}));
vi.mock("../../../../../application/hooks/useFormValidation", () => ({
  useFormValidation: () => ({
    errors: {},
    validate: vi.fn().mockReturnValue(true),
    clearError: vi.fn(),
    resetErrors: vi.fn(),
  }),
}));
vi.mock("../../../../../application/hooks/useModalKeyHandling", () => ({
  useModalKeyHandling: vi.fn(),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CreateTask from "../index";

describe("CreateTask", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<CreateTask isOpen={true} setIsOpen={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });

  it("keeps in-progress edits when the users list refetches (new array identity)", () => {
    const initialData: any = {
      id: 5,
      title: "Task 5",
      creator_id: 2,
      priority: "High",
      status: "Open",
      due_date: "2026-10-06",
      assignees: [2],
      categories: [],
      entity_links: [{ entity_id: 1, entity_type: "policy", entity_name: "Policy One" }],
    };
    const props = { isOpen: true, setIsOpen: vi.fn(), initialData, mode: "edit" as const };
    const { rerender } = renderWithProviders(<CreateTask {...props} />);

    // Hydrated with the task's existing link
    expect(mocks.lastLinkProps.current.value).toHaveLength(1);

    // User adds another linked item through the selector
    act(() => {
      mocks.lastLinkProps.current.onChange([
        ...mocks.lastLinkProps.current.value,
        { entity_id: 2, entity_type: "policy", entity_name: "Policy Two" },
      ]);
    });
    expect(mocks.lastLinkProps.current.value).toHaveLength(2);

    // A users refetch returns the same content with a NEW array identity
    // (react-query refetchOnWindowFocus). The form must NOT reset.
    mocks.usersState.users = [...mocks.usersState.users];
    rerender(<CreateTask {...props} />);
    expect(mocks.lastLinkProps.current.value).toHaveLength(2);

    // Opening a different task still re-hydrates the form
    const otherData: any = { ...initialData, id: 6, entity_links: [] };
    rerender(<CreateTask {...props} initialData={otherData} />);
    expect(mocks.lastLinkProps.current.value).toHaveLength(0);
  });
});
