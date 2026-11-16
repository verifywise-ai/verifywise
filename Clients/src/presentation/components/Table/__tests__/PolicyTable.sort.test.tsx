import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TableRow, TableCell } from "@mui/material";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomizablePolicyTable from "../PolicyTable";

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 1, name: "Zed", surname: "Zimmer" },
      { id: 2, name: "Ada", surname: "Lovelace" },
      { id: 3, name: "mia", surname: "Brown" },
    ],
  }),
}));

const cols = [
  { id: "title", name: "Title" },
  { id: "author", name: "Author" },
  { id: "updated_by", name: "Updated by" },
];
// Id order (1, 2, 3, 10) differs from name order and from string-id order.
const rows = [
  { id: 1, title: "P-one", author_id: 1, last_updated_by: 3 },
  { id: 2, title: "P-two", author_id: 3, last_updated_by: 2 },
  { id: 3, title: "P-three", author_id: 10, last_updated_by: 1 },
  { id: 4, title: "P-four", author_id: 2, last_updated_by: 10 },
];

const renderTable = () =>
  renderWithProviders(
    <CustomizablePolicyTable
      data={{ cols, rows }}
      setSelectedRow={vi.fn()}
      setAnchorEl={vi.fn()}
      renderRow={(policy: any) => (
        <TableRow key={policy.id} data-testid="policy-row">
          <TableCell>{policy.title}</TableCell>
        </TableRow>
      )}
    />,
  );

const titles = () =>
  screen.getAllByTestId("policy-row").map((r) => within(r).getByRole("cell").textContent);

describe("policy table sorting by person", () => {
  beforeEach(() => localStorage.clear());

  it("sorts Author by the author's name, unknown users first", async () => {
    renderTable();
    await userEvent.click(screen.getByText("Author"));
    // "" (unknown id 10), Ada (2), mia (3), Zed (1)
    expect(titles()).toEqual(["P-three", "P-four", "P-two", "P-one"]);
    await userEvent.click(screen.getByText("Author"));
    expect(titles()).toEqual(["P-one", "P-two", "P-four", "P-three"]);
  });

  it("sorts Updated by by the editor's name", async () => {
    renderTable();
    await userEvent.click(screen.getByText("Updated by"));
    // "" (10), Ada (2), mia (3), Zed (1)
    expect(titles()).toEqual(["P-four", "P-two", "P-one", "P-three"]);
  });
});
