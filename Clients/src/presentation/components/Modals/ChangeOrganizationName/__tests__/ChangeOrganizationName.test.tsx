import { vi } from "vitest";

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
vi.mock("../../../../../application/repository/organization.repository", () => ({
  UpdateMyOrganization: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], refreshUsers: vi.fn() }),
}));
vi.mock("../../../Alert", () => ({
  default: () => null,
}));
vi.mock("../../../../../application/tools/log.engine", () => ({
  logEngine: { info: vi.fn(), error: vi.fn() },
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ChangeOrganizationNameModal from "../index";

describe("ChangeOrganizationNameModal", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <ChangeOrganizationNameModal
        isOpen={true}
        onClose={vi.fn()}
        currentOrgName="Test Org"
        organizationId={1}
      />,
    );
    expect(document.body).toBeTruthy();
  });
});
