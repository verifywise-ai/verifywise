import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

// Editing an incident needs incident.edit; its approval status and notes need
// incident.approve. Approved by and approval date are the server's.

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ id: 3, project_title: "Chatbot" }] }),
}));

import SideDrawerIncident, { type NewIncidentFormValues } from "../index";
import {
  AIIncidentManagementApprovalStatus,
  IncidentManagementStatus,
  Severity,
} from "../../../../../domain/enums/aiIncidentManagement.enum";

const STORED: NewIncidentFormValues = {
  incident_id: "INC-42",
  ai_project: "Chatbot",
  project_id: 3,
  model_inventory_id: "",
  assignee_id: "",
  type: "Malfunction",
  severity: Severity.SERIOUS,
  status: IncidentManagementStatus.OPEN,
  occurred_date: "2026-09-20",
  date_detected: "2026-09-21",
  reporter: "Ada",
  categories_of_harm: ["Safety"],
  description: "Model produced unsafe output",
  interim_report: false,
  approval_status: AIIncidentManagementApprovalStatus.APPROVED,
  approved_by: "Jane Doe",
  approval_date: "2026-10-01",
  approval_notes: "Closure signed off",
  expected_updated_at: "2026-10-10T12:34:56.789Z",
};

const field = (id: string) => document.getElementById(id) as HTMLInputElement;

function renderDrawer(access: { canEditDetails: boolean; canApprove: boolean }) {
  const onSuccess = vi.fn().mockResolvedValue(true);
  renderWithProviders(
    <SideDrawerIncident
      isOpen
      setIsOpen={vi.fn()}
      onSuccess={onSuccess}
      initialData={STORED}
      isEdit
      mode="edit"
      {...access}
    />,
  );
  return onSuccess;
}

describe("NewIncident drawer — edit versus approve", () => {
  it("lets an approver change only the approval status and notes", async () => {
    const onSuccess = renderDrawer({ canEditDetails: false, canApprove: true });

    expect(await screen.findByText("Record approval")).toBeInTheDocument();
    expect(field("description")).toBeDisabled();
    expect(field("model_version")).toBeDisabled();
    expect(field("approval_status")).not.toBeDisabled();
    expect(field("approval_notes")).not.toBeDisabled();

    fireEvent.change(field("approval_notes"), { target: { value: "Reviewed again" } });
    fireEvent.click(screen.getByText("Update incident"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith({
      approval_notes: "Reviewed again",
      expected_updated_at: STORED.expected_updated_at,
    });
  });

  it("lets an editor change the details but not the approval", async () => {
    renderDrawer({ canEditDetails: true, canApprove: false });

    expect(await screen.findByText("Edit incident")).toBeInTheDocument();
    expect(field("description")).not.toBeDisabled();
    expect(field("approval_status")).toBeDisabled();
    expect(field("approval_notes")).toBeDisabled();
  });

  it("shows the approver and approval date read-only, and never sends them", async () => {
    const onSuccess = renderDrawer({ canEditDetails: true, canApprove: true });

    await screen.findByText("Edit incident");
    expect(field("approved_by")).toBeDisabled();
    expect(field("approved_by").value).toBe("Jane Doe");
    expect(field("approval_date")).toBeDisabled();
    expect(field("approval_date").value).toBe("2026-10-01");

    fireEvent.change(field("description"), { target: { value: "Model produced unsafe advice" } });
    fireEvent.click(screen.getByText("Update incident"));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const body = onSuccess.mock.calls[0][0];
    expect(body).toEqual({
      description: "Model produced unsafe advice",
      expected_updated_at: STORED.expected_updated_at,
    });
  });
});
