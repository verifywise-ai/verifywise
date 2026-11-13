import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AddRepositoryModal from "../AddRepositoryModal";
import type { AIDetectionRepository } from "../../../../domain/ai-detection/repositoryTypes";

const mockGenerateWebhookSecret = vi.fn();
const mockGetWebhookConfig = vi.fn();

vi.mock("../../../../application/repository/aiDetectionRepository.repository", () => ({
  generateWebhookSecret: (...args: unknown[]) => mockGenerateWebhookSecret(...args),
  getWebhookConfig: (...args: unknown[]) => mockGetWebhookConfig(...args),
}));

// Select is a heavy MUI dropdown; stub it with a native <select> so tests can
// drive selection directly via fireEvent.change while keeping onChange wiring intact.
vi.mock("../../../components/Inputs/Select", () => ({
  default: ({ id, label, value, items, onChange }: any) => (
    <div>
      {label && <label htmlFor={id}>{label}</label>}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange({ target: { value: e.target.value } })}
      >
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
    mockGetWebhookConfig.mockResolvedValue({
      webhook_url: "https://vw.example.com/api/webhooks/github",
      is_public: true,
    });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("shows the add-repository title and submit label when not editing", () => {
    renderWithProviders(<AddRepositoryModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Add repository" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add repository" })).toBeInTheDocument();
    expect(
      screen.getByText("Register a GitHub repository for monitoring and optional scheduled scans."),
    ).toBeInTheDocument();
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
    expect(screen.getByLabelText("Minimum governance score")).toBeInTheDocument();
    expect(screen.getByLabelText("Max critical findings")).toBeInTheDocument();
    expect(screen.getByText("PR checks fail when the score is below this")).toBeInTheDocument();
    expect(
      screen.getByText("PR checks fail when a scan has more critical findings than this"),
    ).toBeInTheDocument();
    expect(screen.getByText("CI/CD integration")).toBeInTheDocument();
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
    expect(screen.getByLabelText("Webhook secret")).toBeInTheDocument();
  });

  it("copies the webhook URL to the clipboard", async () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Webhook URL")).toHaveValue(
        "https://vw.example.com/api/webhooks/github",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy webhook URL" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://vw.example.com/api/webhooks/github",
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

    fireEvent.click(screen.getByRole("button", { name: "Regenerate secret" }));

    await waitFor(() => {
      expect(mockGenerateWebhookSecret).toHaveBeenCalledWith(1);
    });
  });

  it("submits update data reflecting the edited CI thresholds", async () => {
    const onSubmit = vi.fn().mockResolvedValue(editingRepository);
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

  it("shows the GitHub setup step after adding a repository with CI/CD on", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue({
      ...editingRepository,
      id: 7,
      webhook_secret: "fresh-secret",
    });
    renderWithProviders(<AddRepositoryModal isOpen onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("https://github.com/owner/repo"), {
      target: { value: "https://github.com/acme/widgets" },
    });
    fireEvent.click(screen.getAllByRole("switch")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));

    expect(await screen.findByRole("heading", { name: "Connect GitHub" })).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ci_enabled: true }));
    expect(screen.getByLabelText("Webhook secret")).toHaveValue("fresh-secret");
    expect(screen.getByText(/Settings → Webhooks → Add webhook/)).toBeInTheDocument();
    expect(screen.getByText(/tick Pull requests and Pushes/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy webhook secret" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("fresh-secret");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes after adding a repository without CI/CD", async () => {
    const onClose = vi.fn();
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ ...editingRepository, ci_enabled: false, webhook_secret: null });
    renderWithProviders(<AddRepositoryModal isOpen onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Connect GitHub" })).not.toBeInTheDocument();
  });

  it("stays open when the save fails", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<AddRepositoryModal isOpen onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("warns when the webhook URL is not reachable from the internet", async () => {
    mockGetWebhookConfig.mockResolvedValue({
      webhook_url: "http://localhost:5173/api/webhooks/github",
      is_public: false,
    });
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    expect(
      await screen.findByText(/GitHub must be able to reach this address/),
    ).toBeInTheDocument();
  });

  it("does not warn for a public webhook URL", async () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    await waitFor(() => expect(mockGetWebhookConfig).toHaveBeenCalled());
    expect(screen.queryByText(/GitHub must be able to reach this address/)).not.toBeInTheDocument();
  });

  it("blocks saving with an invalid minimum governance score", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={onSubmit}
        editingRepository={editingRepository}
      />,
    );

    fireEvent.change(screen.getByLabelText("Minimum governance score"), {
      target: { value: "150" },
    });

    expect(screen.getByText("Enter a whole number from 0 to 100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("shows the last webhook delivery when editing", () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={{
          ...editingRepository,
          last_webhook_at: "2026-11-12T10:00:00Z",
          last_webhook_status: "error",
        }}
      />,
    );

    expect(screen.getByTestId("last-webhook-delivery")).toHaveTextContent(
      /Received, but the scan could not start/,
    );
  });

  it("says when no webhook has arrived yet", () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    expect(screen.getByTestId("last-webhook-delivery")).toHaveTextContent(
      "No webhook deliveries received yet.",
    );
  });

  it("shows the scheduled time in the viewer's time zone", () => {
    renderWithProviders(
      <AddRepositoryModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        editingRepository={editingRepository}
      />,
    );

    expect(screen.getByTestId("schedule-local-time")).toHaveTextContent(
      /^04:30 UTC = \d{2}:\d{2} your time$/,
    );
  });
});
