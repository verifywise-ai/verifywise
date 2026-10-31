import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import EditRetentionModal from "../EditRetentionModal";
import type { RetentionRow } from "../../../../../application/repository/dataRetention.repository";
import CustomException from "../../../../../infrastructure/exceptions/customeException";

const updateGatewayRetention = vi.fn();
vi.mock("../../../../../application/repository/dataRetention.repository", async (orig) => ({
  ...(await orig<object>()),
  updateGatewayRetention: (...args: unknown[]) => updateGatewayRetention(...args),
}));
vi.mock("../../../../../application/hooks/useDataRetention", () => ({
  useInvalidateDataRetention: () => vi.fn(),
}));

const agentRow = (overrides: Partial<RetentionRow> = {}): RetentionRow => ({
  key: "agent_control_logs",
  period: { unit: "days", value: 30 },
  automaticDeletion: "yes",
  lastCleanup: null,
  source: "app",
  usesDeploymentDefault: true,
  deploymentDefaultDays: 30,
  minDays: 7,
  ...overrides,
});

function open(row: RetentionRow) {
  const onClose = vi.fn();
  renderWithProviders(<EditRetentionModal row={row} rows={[row]} onClose={onClose} />);
  return onClose;
}

describe("EditRetentionModal: Agent Control logs", () => {
  // A block body: a function returned from beforeEach runs as a teardown hook.
  beforeEach(() => {
    updateGatewayRetention.mockReset().mockResolvedValue(undefined);
  });

  it("saves an own period longer than the current one without confirming", async () => {
    open(agentRow());
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.change(screen.getByLabelText("Keep for (days)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateGatewayRetention).toHaveBeenCalledWith({ mcp_audit_retention_days: 90 }),
    );
  });

  it("rejects a period below the floor", async () => {
    open(agentRow());
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.change(screen.getByLabelText("Keep for (days)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a number of at least 7")).toBeInTheDocument();
    expect(updateGatewayRetention).not.toHaveBeenCalled();
  });

  it("confirms before shortening, then saves", async () => {
    open(agentRow());
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.change(screen.getByLabelText("Keep for (days)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/will be deleted permanently/)).toBeInTheDocument();
    expect(updateGatewayRetention).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() =>
      expect(updateGatewayRetention).toHaveBeenCalledWith({ mcp_audit_retention_days: 10 }),
    );
  });

  it("confirms a reset to a shorter deployment default", async () => {
    open(agentRow({ period: { unit: "days", value: 90 }, usesDeploymentDefault: false }));
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/will be deleted permanently/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() =>
      expect(updateGatewayRetention).toHaveBeenCalledWith({ mcp_audit_retention_days: null }),
    );
  });

  it("starts the days field empty when turning the default off", async () => {
    open(agentRow());
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    expect(screen.getByLabelText("Keep for (days)")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a whole number")).toBeInTheDocument();
    expect(updateGatewayRetention).not.toHaveBeenCalled();
  });

  it("pre-fills the days field with the organization's own period", () => {
    open(agentRow({ period: { unit: "days", value: 45 }, usesDeploymentDefault: false }));
    expect(screen.getByLabelText("Keep for (days)")).toHaveValue("45");
  });

  it("shows the gateway's error while the deployment default is on", async () => {
    updateGatewayRetention.mockRejectedValue(
      new CustomException("Request failed with status code 400", 400, {
        detail: "Retention is locked by the deployment",
      }),
    );
    open(agentRow({ period: { unit: "days", value: 10 }, usesDeploymentDefault: false }));
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Retention is locked by the deployment")).toBeInTheDocument();
    expect(screen.queryByLabelText("Keep for (days)")).not.toBeInTheDocument();
  });

  it("returns from the confirmation to the form with the gateway's error", async () => {
    updateGatewayRetention.mockRejectedValue(
      new CustomException("Request failed with status code 400", 400, {
        detail: "Retention is locked by the deployment",
      }),
    );
    open(agentRow({ period: { unit: "days", value: 90 }, usesDeploymentDefault: false }));
    fireEvent.click(screen.getByRole("switch", { name: /use the deployment default/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete records" }));
    expect(await screen.findByText("Retention is locked by the deployment")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /use the deployment default/i })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("closes without saving when nothing changed", async () => {
    const onClose = open(agentRow());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateGatewayRetention).not.toHaveBeenCalled();
  });
});
