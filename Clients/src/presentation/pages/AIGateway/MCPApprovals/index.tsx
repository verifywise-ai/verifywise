import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Stack } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { CheckCircle, XCircle, ShieldCheck, AlertTriangle, RotateCcw } from "lucide-react";
import TabBar from "../../../components/TabBar";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import { CustomizableButton } from "../../../components/button/customizable-button";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { sectionTitleSx, useCardSx, MCP_STATUS_COLORS, MCP_STATUS_FALLBACK } from "../shared";
import MCPTable from "../MCPTable";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import palette from "../../../themes/palette";
import CustomizableSkeleton from "../../../components/Skeletons";

interface Approval {
  id: number;
  agent_key_id: number;
  key_name?: string;
  agent_key_name?: string;
  tool_name: string;
  arguments: Record<string, unknown> | null;
  status: string;
  decided_by: number | null;
  decided_by_name?: string;
  decided_at: string | null;
  decision_reason: string | null;
  expires_at: string;
  created_at: string;
}

// Uses MCP_STATUS_COLORS from shared.ts

export default function MCPApprovalsPage() {
  const cardSx = useCardSx();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [pending, setPending] = useState<Approval[]>([]);
  const [history, setHistory] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Decision modal state
  const [decisionTarget, setDecisionTarget] = useState<{
    id: number;
    action: "approve" | "deny";
    tool_name: string;
  } | null>(null);
  const [reason, setReason] = useState("");

  const loadPending = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiServices.get<Record<string, any>>("/ai-gateway/mcp/approvals");
      setPending(res?.data?.data || []);
    } catch {
      setLoadError("Failed to load pending approvals. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiServices.get<Record<string, any>>(
        "/ai-gateway/mcp/approvals/history?limit=50",
      );
      setHistory(res?.data?.data || []);
    } catch {
      setLoadError("Failed to load approval history. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "pending") loadPending();
    else loadHistory();
  }, [tab, loadPending, loadHistory]);

  // Poll the pending tab so newly-arrived approval requests appear without a
  // manual refresh. Only runs while the pending tab is active and the browser
  // tab is visible, so backgrounded tabs don't keep hitting the API.
  useEffect(() => {
    if (tab !== "pending") return;
    const interval = setInterval(() => {
      if (!document.hidden) loadPending();
    }, 10000);
    const onVisible = () => {
      if (!document.hidden) loadPending();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tab, loadPending]);

  const handleDecision = async () => {
    if (!decisionTarget) return;
    try {
      await apiServices.post(
        `/ai-gateway/mcp/approvals/${decisionTarget.id}/${decisionTarget.action}`,
        { reason: reason || undefined },
      );
      setDecisionTarget(null);
      setReason("");
      loadPending();
    } catch {
      // silent
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m remaining`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m remaining`;
  };

  const isEmpty =
    (tab === "pending" && pending.length === 0) || (tab === "history" && history.length === 0);

  const items = tab === "pending" ? pending : history;

  return (
    <PageHeaderExtended
      title="Approvals"
      description="Review and decide on agent tool calls that require human approval before they run."
      helpArticlePath="ai-gateway/mcp-approvals"
    >
      {/* Tab bar */}
      <Box sx={{ px: 3, pt: 1 }}>
        <TabContext value={tab}>
          <TabBar
            tabs={[
              { label: "History", value: "history", icon: "History" as const },
              {
                label: `Pending${pending.length > 0 ? ` (${pending.length})` : ""}`,
                value: "pending",
                icon: "Clock" as const,
              },
            ]}
            activeTab={tab}
            onChange={(_, v) => setTab(v as "pending" | "history")}
          />
        </TabContext>
      </Box>

      {loading ? (
        <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
      ) : loadError ? (
        <EmptyState icon={AlertTriangle} message={loadError}>
          <CustomizableButton
            variant="outlined"
            text="Retry"
            icon={<RotateCcw size={16} />}
            onClick={() => (tab === "pending" ? loadPending() : loadHistory())}
          />
        </EmptyState>
      ) : isEmpty ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <EmptyState
            icon={ShieldCheck}
            message={tab === "pending" ? "No pending approvals" : "No approval history yet"}
            showBorder
          >
            <EmptyStateTip
              icon={ShieldCheck}
              title={tab === "pending" ? "How to trigger approvals" : "No history yet"}
              description={
                tab === "pending"
                  ? "Mark a tool as 'requires approval' in the Tool Catalog, then call it with an agent key."
                  : "Approved or denied requests will appear here."
              }
            />
          </EmptyState>
        </Box>
      ) : (
        <>
          <Typography sx={{ ...sectionTitleSx, px: 3, pb: 1 }}>
            {tab === "pending" ? "Pending requests" : "Decision history"}
          </Typography>

          {tab === "history" ? (
            <Box sx={{ px: 3, pb: 3 }}>
              <MCPTable
                id="mcp-approvals-history-table"
                columns={[
                  { label: "Tool", width: 160 },
                  { label: "Status", width: 110 },
                  { label: "Agent key", width: 160 },
                  { label: "Arguments" },
                  { label: "Decided by", width: 180 },
                  { label: "Reason", width: 200 },
                ]}
                rows={history}
                rowKey={(item) => item.id}
                renderRow={(item) => {
                  const colors = MCP_STATUS_COLORS[item.status] || { ...MCP_STATUS_FALLBACK };
                  return [
                    <Typography sx={{ fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>
                      {item.tool_name}
                    </Typography>,
                    <Chip
                      label={item.status}
                      backgroundColor={colors.bg}
                      textColor={colors.text}
                    />,
                    <Typography variant="body2" color="text.secondary">
                      {item.key_name || item.agent_key_name || `Key #${item.agent_key_id}`}
                    </Typography>,
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontFamily: "monospace", fontSize: 12 }}
                    >
                      {item.arguments && Object.keys(item.arguments).length > 0
                        ? JSON.stringify(item.arguments).slice(0, 120)
                        : "—"}
                    </Typography>,
                    <Typography variant="body2" color="text.secondary">
                      {item.decided_at
                        ? `${item.decided_by_name || `User #${item.decided_by}`} · ${displayFormattedDate(item.decided_at)}`
                        : "—"}
                    </Typography>,
                    <Typography variant="body2" color="text.secondary">
                      {item.decision_reason || "—"}
                    </Typography>,
                  ];
                }}
              />
            </Box>
          ) : (
            <Stack spacing={1.5} sx={{ px: 3, pb: 3 }}>
              {items.map((item) => {
                const colors = MCP_STATUS_COLORS[item.status] || {
                  ...MCP_STATUS_FALLBACK,
                };
                return (
                  <Box key={item.id} sx={cardSx}>
                    <Stack spacing={1.5}>
                      {/* Top row: tool + status + actions */}
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Stack direction="row" alignItems="center" spacing={2}>
                          <Typography
                            sx={{
                              fontWeight: 600,
                              fontSize: 14,
                              fontFamily: "monospace",
                            }}
                          >
                            {item.tool_name}
                          </Typography>
                          <Chip
                            label={item.status}
                            backgroundColor={colors.bg}
                            textColor={colors.text}
                          />
                          {tab === "pending" && (
                            <Typography
                              variant="body2"
                              sx={{ color: palette.text.disabled, fontSize: 12 }}
                            >
                              {getTimeRemaining(item.expires_at)}
                            </Typography>
                          )}
                        </Stack>

                        {tab === "pending" && (
                          <Stack direction="row" spacing={1}>
                            <CustomizableButton
                              text="Approve"
                              onClick={() =>
                                setDecisionTarget({
                                  id: item.id,
                                  action: "approve",
                                  tool_name: item.tool_name,
                                })
                              }
                              variant="contained"
                              startIcon={<CheckCircle size={14} />}
                              sx={{
                                "backgroundColor": "#065F46",
                                "&:hover": { backgroundColor: "#047857" },
                              }}
                            />
                            <CustomizableButton
                              text="Deny"
                              onClick={() =>
                                setDecisionTarget({
                                  id: item.id,
                                  action: "deny",
                                  tool_name: item.tool_name,
                                })
                              }
                              variant="outlined"
                              startIcon={<XCircle size={14} />}
                              sx={{
                                "color": "#991B1B",
                                "borderColor": "#FCA5A5",
                                "&:hover": {
                                  backgroundColor: "#FEF2F2",
                                  borderColor: "#991B1B",
                                },
                              }}
                            />
                          </Stack>
                        )}
                      </Stack>

                      {/* Details row */}
                      <Stack direction="row" spacing={3}>
                        <Typography variant="body2" color="text.secondary">
                          Agent:{" "}
                          <strong>
                            {item.key_name || item.agent_key_name || `Key #${item.agent_key_id}`}
                          </strong>
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Requested: {displayFormattedDate(item.created_at)}
                        </Typography>
                        {item.decided_at && (
                          <Typography variant="body2" color="text.secondary">
                            Decided by: {item.decided_by_name || `User #${item.decided_by}`} at{" "}
                            {displayFormattedDate(item.decided_at)}
                          </Typography>
                        )}
                      </Stack>

                      {/* Arguments preview */}
                      {item.arguments && Object.keys(item.arguments).length > 0 && (
                        <Box
                          sx={{
                            backgroundColor: "#F9FAFB",
                            borderRadius: 1,
                            p: 1,
                            fontFamily: "monospace",
                            fontSize: 12,
                            color: palette.text.secondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {JSON.stringify(item.arguments).slice(0, 200)}
                        </Box>
                      )}

                      {/* Decision reason */}
                      {item.decision_reason && (
                        <Typography variant="body2" color="text.secondary">
                          Reason: {item.decision_reason}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          )}
        </>
      )}

      {/* Decision confirmation modal */}
      {decisionTarget && (
        <StandardModal
          isOpen
          onClose={() => {
            setDecisionTarget(null);
            setReason("");
          }}
          title={`${decisionTarget.action === "approve" ? "Approve" : "Deny"} tool call`}
          description={`Tool: ${decisionTarget.tool_name}`}
          onSubmit={handleDecision}
          submitButtonText={decisionTarget.action === "approve" ? "Approve" : "Deny"}
        >
          <Field
            label="Reason (optional)"
            placeholder="Add a reason for this decision..."
            value={reason}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
          />
        </StandardModal>
      )}
    </PageHeaderExtended>
  );
}
