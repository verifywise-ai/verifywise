import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AddRepositoryModal from "../AddRepositoryModal";
import type { AIDetectionRepository } from "../../../../domain/ai-detection/repositoryTypes";

const mockGenerateWebhookSecret = vi.fn();

vi.mock("../../../../application/repository/aiDetectionRepository.repository", () => ({
  generateWebhookSecret: (...args: unknown[]) => mockGenerateWebhookSecret(...args),
}));

// Select is a heavy MUI dropdown; stub it with a native <select> so tests can
// drive selection directly via fireEvent.change while keeping onChange wiring intact.
vi.mock("../../../components/Inputs/Select", () => ({
  default: ({ id, label, value, items, onChange }: any) => (
    <div>
      {label && <label htmlFor={id}>{label}</label>}
      <select id={id} value={value} onChange={(e) => onChange({ target: { value: e.target.value } })}>
        {items.map((item: any) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  ),
}));

const editingRepository: AIDetectionRepository = {
  id: 1,
  repository_url: "https://github.com/acme/widgets",
  repository_owner: "acme",
  repository_name: "widgets",
  display_name: "Widgets service",
  default_branch: "main",
  schedule_enabled: true,
  schedule_frequency: "weekly",
  schedule_day_of_week: 3,
  schedule_day_of_month: null,
  schedule_hour: 4,
  schedule_minute: 30,
  webhook_secret: "existing-secret",
  ci_enabled: true,
  ci_min_score: 60,
  ci_max_critical: 2,
  ci_post_comments: false,
  ci_status_checks: true,
  is_enabled: true,
  created_by: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("AddRepositoryModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  it("shows the add-repository title and submit label when not editing", () => {
    renderWithProviders(
      <AddRepositoryModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "Add repository" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add repository" })).toBeInTheDocument();
    expect(screen.getByText("Register a GitHub repository for monitoring and optional scheduled scans.")).toBeInTheDocument();
  });

  it("shows the edit title and pre-fills fields when editing", () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    expect(screen.getByRole("heading", { name: "Edit repository" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://github.com/acme/widgets")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Widgets service")).toBeInTheDocument();
  });

  it("disables the GitHub URL field while editing", () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    expect(screen.getByDisplayValue("https://github.com/acme/widgets")).toBeDisabled();
  });

  it("submits create data with schedule disabled by default", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<AddRepositoryModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/acme/new-repo" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          repository_url: "https://github.com/acme/new-repo",
          schedule_enabled: false,
          schedule_frequency: null,
        }),
      );
    });
  });

  it("reveals schedule fields when the schedule toggle is enabled", () => {
    renderWithProviders(<AddRepositoryModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText("Frequency")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("switch")[0]);

    expect(screen.getByLabelText("Frequency")).toBeInTheDocument();
  });

  it("shows the day-of-week selector when frequency is weekly", () => {
    renderWithProviders(<AddRepositoryModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("switch")[0]);
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "weekly" } });

    expect(screen.getByLabelText("Day of week")).toBeInTheDocument();
  });

  it("shows the day-of-month selector when frequency is monthly", () => {
    renderWithProviders(<AddRepositoryModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getAllByRole("switch")[0]);
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "monthly" } });

    expect(screen.getByLabelText("Day of month")).toBeInTheDocument();
  });

  it("reveals CI/CD fields when the CI toggle is enabled", () => {
    renderWithProviders(<AddRepositoryModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText("Webhook URL")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("switch")[1]);

    expect(screen.getByLabelText("Webhook URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Risk score threshold")).toBeInTheDocument();
    expect(screen.getByLabelText("Max critical findings")).toBeInTheDocument();
  });

  it("shows the webhook secret field only when editing and CI is enabled", () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    // CI already enabled from editingRepository
    expect(screen.getByLabelText("Webhook Secret")).toBeInTheDocument();
  });

  it("copies the webhook URL to the clipboard", () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    // Click the icon button inside the webhook URL field (copy button)
    const urlField = screen.getByLabelText("Webhook URL").closest("div");
    const button = urlField?.querySelector("button");
    if (button) fireEvent.click(button);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/api/webhooks/github"),
    );
  });

  it("generates a new webhook secret when requested", async () => {
    mockGenerateWebhookSecret.mockResolvedValue({ webhook_secret: "new-secret-value" });

    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    // Webhook Secret field's icon buttons: copy (only when secret exists) + regenerate (always last)
    const secretField = screen.getByLabelText("Webhook Secret").closest("div");
    const buttons = secretField?.querySelectorAll("button");
    const regenerateButton = buttons?.[buttons.length - 1] as HTMLElement;
    fireEvent.click(regenerateButton);

    await waitFor(() => {
      expect(mockGenerateWebhookSecret).toHaveBeenCalledWith(1);
    });
  });

  it("submits update data reflecting the edited CI thresholds", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={onSubmit}
        editingRepository={editingRepository}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          display_name: "Widgets service",
          ci_enabled: true,
          ci_min_score: 60,
        }),
      );
    });
  });

  it("calls onClose when the modal cancel action is triggered", () => {
    const onClose = vi.fn();
    renderWithProviders(<AddRepositoryModal isOpen onClose={onClose} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
