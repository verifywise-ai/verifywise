import { vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A stable roles array: the modal resets its form whenever roles changes.
const mocks = vi.hoisted(() => ({
  sendInviteEmail: vi.fn(),
  roles: [{ id: 3, name: "Editor" }],
}));

vi.mock("../../StandardModal", () => ({
  default: ({ isOpen, children, onSubmit }: any) =>
    isOpen ? (
      <div>
        {children}
        <button onClick={onSubmit}>submit</button>
      </div>
    ) : null,
}));
vi.mock("../../../Inputs/Field", () => ({
  default: (props: any) => (
    <input placeholder={props.placeholder} value={props.value} onChange={props.onChange} />
  ),
}));
vi.mock("../../../Inputs/Select", () => ({
  default: () => <div />,
}));
vi.mock("../../../../../application/repository/mail.repository", () => ({
  sendInviteEmail: mocks.sendInviteEmail,
}));
vi.mock("../../../../../application/hooks/useRoles", () => ({
  useRoles: () => ({ roles: mocks.roles }),
}));
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ organizationId: 1 }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CustomException from "../../../../../infrastructure/exceptions/customeException";
import InviteUserModal from "../index";

async function submitWith(error: Error) {
  mocks.sendInviteEmail.mockRejectedValue(error);
  const onSendInvite = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<InviteUserModal isOpen setIsOpen={vi.fn()} onSendInvite={onSendInvite} />);
  await user.type(screen.getByPlaceholderText("Enter name"), "New");
  await user.type(screen.getByPlaceholderText("Enter email address"), "new@example.com");
  await user.click(screen.getByText("submit"));
  await waitFor(() => expect(onSendInvite).toHaveBeenCalled());
  return onSendInvite;
}

describe("InviteUserModal errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the server's reason on when the invite is refused", async () => {
    const onSendInvite = await submitWith(
      new CustomException("You cannot invite a user with more access than your own", 403, {}),
    );
    expect(onSendInvite).toHaveBeenCalledWith(
      "new@example.com",
      -1,
      undefined,
      "You cannot invite a user with more access than your own",
    );
  });

  it("passes the server's reason on when the invitation changed meanwhile", async () => {
    const message = "The invitation was changed by someone else. Try again.";
    const onSendInvite = await submitWith(new CustomException(message, 409, {}));
    expect(onSendInvite).toHaveBeenCalledWith("new@example.com", -1, undefined, message);
  });

  it("keeps the generic message for a server or network failure", async () => {
    const onSendInvite = await submitWith(new CustomException("Internal Server Error", 500, {}));
    expect(onSendInvite).toHaveBeenCalledWith("new@example.com", -1, undefined, undefined);
  });
});
