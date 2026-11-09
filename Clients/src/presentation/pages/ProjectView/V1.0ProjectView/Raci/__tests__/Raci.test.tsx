import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { RaciRole, RaciSubjectType } from "../../../../../../domain/enums/raci.enum";
import type { RaciMatrix, RaciRow } from "../../../../../../application/repository/raci.repository";
import Raci from "../index";
import { buildRaciExportRows } from "../raci.constants";

const PEOPLE = [
  { id: 7, name: "Grace", surname: "Hopper", email: "grace@example.com" },
  { id: 8, name: "Alan", surname: "Turing", email: "alan@example.com" },
];

const { getMock, updateMock, authMock, usersMock, exportProps } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  authMock: vi.fn(() => ({ userRoleName: "Admin" })),
  usersMock: vi.fn(),
  exportProps: { current: null as null | { data: unknown[]; columns: unknown[] } },
}));

vi.mock("../../../../../../application/repository/raci.repository", () => ({
  getRaciMatrix: getMock,
  updateRaciUserRoles: updateMock,
}));

vi.mock("../../../../../../application/hooks/useAuth", () => ({
  useAuth: authMock,
}));

vi.mock("../../../../../../application/hooks/useUsers", () => ({
  default: usersMock,
}));

vi.mock("../../../../../components/Table/ExportMenu", () => ({
  ExportMenu: (props: { data: unknown[]; columns: unknown[] }) => {
    exportProps.current = props;
    return <div data-testid="export-menu" />;
  },
}));

const owner: RaciRow = {
  subject_type: RaciSubjectType.USER,
  subject_id: 1,
  name: "Ada Lovelace",
  email: "ada@example.com",
  roles: [{ role: RaciRole.ACCOUNTABLE, sources: ["owner"] }],
  editable: true,
};

const member: RaciRow = {
  subject_type: RaciSubjectType.USER,
  subject_id: 2,
  name: "Bob Member",
  email: "bob@example.com",
  roles: [
    { role: RaciRole.RESPONSIBLE, sources: ["member", "task_assignee"] },
    { role: RaciRole.INFORMED, sources: ["manual"] },
  ],
  editable: true,
};

const external: RaciRow = {
  subject_type: RaciSubjectType.EXTERNAL,
  subject_id: null,
  name: "Eve External",
  email: null,
  roles: [{ role: RaciRole.ACCOUNTABLE, sources: ["owner"] }],
  editable: false,
};

const matrix = (rows: RaciRow[], warnings: RaciMatrix["warnings"] = []): RaciMatrix => ({
  rows,
  warnings,
});

const renderRaci = () => renderWithProviders(<Raci projectId={5} />);

describe("Raci", () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
    authMock.mockReturnValue({ userRoleName: "Admin" });
    usersMock.mockReturnValue({ users: PEOPLE, loading: false, error: null });
    exportProps.current = null;
  });

  it("shows a set role as pressed and an unset one as not pressed", async () => {
    getMock.mockResolvedValue(matrix([owner]));
    renderRaci();

    expect(await screen.findByTestId("button-raci-A-1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("button-raci-R-1")).toHaveAttribute("aria-pressed", "false");
  });

  it("sends only the role switched on", async () => {
    getMock.mockResolvedValue(matrix([member]));
    updateMock.mockResolvedValue(matrix([member]));
    renderRaci();

    fireEvent.click(await screen.findByTestId("button-raci-C-2"));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(5, 2, { add: [RaciRole.CONSULTED] }),
    );
  });

  it("sends only the role switched off", async () => {
    getMock.mockResolvedValue(matrix([member]));
    updateMock.mockResolvedValue(matrix([]));
    renderRaci();

    fireEvent.click(await screen.findByTestId("button-raci-R-2"));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(5, 2, { remove: [RaciRole.RESPONSIBLE] }),
    );
  });

  it("replaces the matrix with the server's answer", async () => {
    getMock.mockResolvedValue(matrix([member]));
    updateMock.mockResolvedValue(matrix([owner]));
    renderRaci();

    fireEvent.click(await screen.findByTestId("button-raci-R-2"));

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("Bob Member")).not.toBeInTheDocument();
  });

  it("disables every toggle and hides add person without edit permission", async () => {
    authMock.mockReturnValue({ userRoleName: "Auditor" });
    getMock.mockResolvedValue(matrix([owner, member]));
    renderRaci();

    const cell = await screen.findByTestId("button-raci-R-2");
    expect(cell).toBeDisabled();
    expect(screen.getByTestId("button-raci-A-1")).toBeDisabled();
    expect(screen.queryByTestId("button-raci-add-person")).not.toBeInTheDocument();
    fireEvent.click(cell);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("keeps an external owner read-only for an admin", async () => {
    getMock.mockResolvedValue(matrix([external]));
    renderRaci();

    expect(await screen.findByText("External owner")).toBeInTheDocument();
    for (const role of ["R", "A", "C", "I"]) {
      expect(screen.getByTestId(`button-raci-${role}-external`)).toBeDisabled();
    }
  });

  it("explains in plain language when nobody or several people are accountable", async () => {
    getMock.mockResolvedValue(matrix([member], ["no_accountable"]));
    const first = renderRaci();
    expect(await screen.findByText(/No one is accountable/)).toBeInTheDocument();
    first.unmount();

    getMock.mockResolvedValue(matrix([owner, member], ["multiple_accountable"]));
    renderRaci();
    expect(await screen.findByText(/More than one person is accountable/)).toBeInTheDocument();
  });

  it("shows no warning when exactly one person is accountable", async () => {
    getMock.mockResolvedValue(matrix([owner]));
    renderRaci();

    await screen.findByTestId("button-raci-A-1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names the source of a set role in plain words", async () => {
    getMock.mockResolvedValue(matrix([member]));
    renderRaci();

    fireEvent.mouseOver((await screen.findByTestId("button-raci-R-2")).parentElement!);

    expect(
      await screen.findByText(
        "Team member of this use case. Assigned to an open task linked to this use case",
      ),
    ).toBeInTheDocument();
  });

  it("passes the loaded rows to the export", async () => {
    getMock.mockResolvedValue(matrix([member, external]));
    renderRaci();

    await screen.findByTestId("button-raci-R-2");
    expect(exportProps.current?.data).toEqual([
      {
        name: "Bob Member",
        email: "bob@example.com",
        roles: "R, I",
        source:
          "R: Team member of this use case. Assigned to an open task linked to this use case; I: Added manually",
      },
      { name: "Eve External", email: "", roles: "A", source: "A: Owner of this use case" },
    ]);
    expect(exportProps.current?.columns).toEqual([
      { id: "name", label: "Name" },
      { id: "email", label: "Email" },
      { id: "roles", label: "Roles" },
      { id: "source", label: "Source" },
    ]);
  });

  it("builds export rows with roles in the order they arrive", () => {
    expect(buildRaciExportRows([owner])).toEqual([
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        roles: "A",
        source: "A: Owner of this use case",
      },
    ]);
  });

  it("shows an empty state", async () => {
    getMock.mockResolvedValue(matrix([], ["no_accountable"]));
    renderRaci();

    expect(
      await screen.findByText("No one has a RACI role on this use case yet."),
    ).toBeInTheDocument();
  });

  it("shows a loading state while the matrix loads", () => {
    getMock.mockReturnValue(new Promise(() => undefined));
    renderRaci();

    expect(screen.getByTestId("raci-loading")).toBeInTheDocument();
  });

  it("shows an error with a retry that loads the matrix again", async () => {
    getMock.mockRejectedValueOnce(new Error("Failed"));
    getMock.mockResolvedValue(matrix([owner]));
    renderRaci();

    fireEvent.click(await screen.findByTestId("button-raci-retry"));

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  describe("add person", () => {
    const openModal = async () => {
      getMock.mockResolvedValue(matrix([owner]));
      updateMock.mockResolvedValue(matrix([owner]));
      renderRaci();
      fireEvent.click(await screen.findByTestId("button-raci-add-person"));
      return screen.findByRole("combobox");
    };

    it("lists only people not already in the matrix", async () => {
      getMock.mockResolvedValue(matrix([{ ...member, subject_id: 7, name: "Grace Hopper" }]));
      renderRaci();
      fireEvent.click(await screen.findByTestId("button-raci-add-person"));

      fireEvent.mouseDown(await screen.findByRole("combobox"));

      expect(await screen.findByRole("option", { name: /Alan Turing/ })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /Grace Hopper/ })).not.toBeInTheDocument();
    });

    it("adds the person with the chosen roles", async () => {
      const combobox = await openModal();
      fireEvent.mouseDown(combobox);
      fireEvent.click(await screen.findByRole("option", { name: /Alan Turing/ }));
      fireEvent.click(screen.getByLabelText("Consulted: gives input before decisions"));
      fireEvent.click(screen.getByRole("button", { name: "Add person" }));

      await waitFor(() =>
        expect(updateMock).toHaveBeenCalledWith(5, 8, { add: [RaciRole.CONSULTED] }),
      );
    });

    it("starts empty when reopened after a successful add", async () => {
      const combobox = await openModal();
      fireEvent.mouseDown(combobox);
      fireEvent.click(await screen.findByRole("option", { name: /Alan Turing/ }));
      fireEvent.click(screen.getByLabelText("Consulted: gives input before decisions"));
      fireEvent.click(screen.getByRole("button", { name: "Add person" }));
      await waitFor(() => expect(screen.queryByRole("combobox")).not.toBeInTheDocument());

      fireEvent.click(screen.getByTestId("button-raci-add-person"));

      expect(await screen.findByRole("combobox")).toHaveValue("");
      expect(screen.getByLabelText("Consulted: gives input before decisions")).not.toBeChecked();
    });

    it.each([
      ["while people load", { users: [], loading: true, error: null }, "Loading people..."],
      [
        "after a failed load",
        { users: [], loading: false, error: "Failed" },
        "People could not be loaded.",
      ],
      ["when there are no people", { users: [], loading: false, error: null }, "No people found."],
    ])("says the right thing %s", async (_label, usersState, message) => {
      usersMock.mockReturnValue(usersState);
      const combobox = await openModal();

      fireEvent.mouseDown(combobox);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText("Everyone is already in this matrix")).not.toBeInTheDocument();
    });

    it("says everyone is in the matrix when they really are", async () => {
      usersMock.mockReturnValue({ users: [PEOPLE[0]], loading: false, error: null });
      getMock.mockResolvedValue(matrix([{ ...member, subject_id: 7 }]));
      renderRaci();
      fireEvent.click(await screen.findByTestId("button-raci-add-person"));

      fireEvent.mouseDown(await screen.findByRole("combobox"));

      expect(await screen.findByText("Everyone is already in this matrix")).toBeInTheDocument();
    });

    it("cannot submit without a role", async () => {
      const combobox = await openModal();
      fireEvent.mouseDown(combobox);
      fireEvent.click(await screen.findByRole("option", { name: /Alan Turing/ }));

      expect(screen.getByRole("button", { name: "Add person" })).toBeDisabled();
    });
  });
});
