import { screen, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../application/hooks/useCan", () => ({
  useCanCheck: () => () => true,
}));

const mockGetAllEntities = vi.fn();
const mockDeleteEntityById = vi.fn();
vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: any[]) => mockGetAllEntities(...args),
  deleteEntityById: (...args: any[]) => mockDeleteEntityById(...args),
}));

const mockCreateLinked = vi.fn();
vi.mock("../../../../application/repository/policyLinkedObjects.repository", () => ({
  createPolicyLinkedObjects: (...args: any[]) => mockCreateLinked(...args),
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../application/repository/file.repository", () => ({
  getUserFilesMetaData: vi.fn().mockResolvedValue([]),
}));

// Capture the props the modal hands its children so the tests can drive them.
let linkedTableProps: any;
vi.mock("../LinkedPoliciesTable", () => ({
  default: (props: any) => {
    linkedTableProps = props;
    return (
      <ul data-testid="linked-items">
        {props.items.map((i: any) => (
          <li key={i.id}>{`item-${i.id}`}</li>
        ))}
      </ul>
    );
  },
}));
let riskSelectorProps: any;
vi.mock("../LinkRiskSelectorModal", () => ({
  default: (props: any) => {
    riskSelectorProps = props;
    return null;
  },
}));
let evidenceSelectorProps: any;
vi.mock("../LinkEvidenceSelectorModal", () => ({
  default: (props: any) => {
    evidenceSelectorProps = props;
    return null;
  },
}));

import LinkedPolicyModal from "../LinkedPolicyModal";

describe("LinkedPolicyModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllEntities.mockResolvedValue({
      data: { risks: [{ id: 1, object_id: 10 }], evidence: [{ id: 2, object_id: 20 }] },
    });
  });

  const renderModal = async () => {
    renderWithProviders(<LinkedPolicyModal isOpen={true} onClose={vi.fn()} policyId={5} />);
    await screen.findByText("item-1");
  };

  describe("linking", () => {
    it("shows a success message once the link is saved", async () => {
      await renderModal();
      mockCreateLinked.mockResolvedValue({});

      await act(async () => {
        await riskSelectorProps.onSubmit([11]);
      });

      expect(await screen.findByText("risk linked successfully!")).toBeInTheDocument();
    });

    it.each([
      ["risk", () => riskSelectorProps, "Couldn't link the selected risks. Try again."],
      ["evidence", () => evidenceSelectorProps, "Couldn't link the selected evidence. Try again."],
    ])("rejects and shows one error when linking %s fails", async (_type, props, message) => {
      await renderModal();
      mockCreateLinked.mockRejectedValue(new Error("boom"));

      let rejected = false;
      await act(async () => {
        await props()
          .onSubmit([11])
          .catch(() => {
            rejected = true;
          });
      });

      // The selector modal needs the rejection to stay open and skip its success path.
      expect(rejected).toBe(true);
      expect(await screen.findAllByText(message)).toHaveLength(1);
      expect(screen.queryByText(/linked successfully/)).not.toBeInTheDocument();
      expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    });
  });

  describe("unlinking", () => {
    it("removes the item and confirms when the delete succeeds", async () => {
      await renderModal();
      mockDeleteEntityById.mockResolvedValue({});

      await act(async () => {
        await linkedTableProps.onRemove("risk", 1);
      });

      await waitFor(() => expect(screen.queryByText("item-1")).not.toBeInTheDocument());
      expect(screen.getByText("risk unlinked successfully!")).toBeInTheDocument();
    });

    it("keeps the item and shows an error when the delete fails", async () => {
      await renderModal();
      mockDeleteEntityById.mockRejectedValue(new Error("nope"));

      await act(async () => {
        await linkedTableProps.onRemove("risk", 1);
      });

      expect(await screen.findByText("Couldn't unlink this item. Try again.")).toBeInTheDocument();
      expect(screen.getByText("item-1")).toBeInTheDocument();
      expect(screen.queryByText(/unlinked successfully/)).not.toBeInTheDocument();
    });
  });
});
