import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Alert,
  Box,
  ButtonBase,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import { MessageSquare, SlidersHorizontal, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { ENV_VARs } from "../../../../../env.vars";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { getApiErrorReason } from "../../../../application/utils/apiErrorReason";
import type {
  SlackConnection,
  UnlinkedSlackConnection,
} from "../../../../application/repository/slack.repository";
import {
  useConnectSlackWorkspace,
  useRemoveSlackConnection,
  useRemoveUnlinkedSlackConnection,
  useSlackConnections,
  useUnlinkedSlackConnections,
  useUpdateSlackConnection,
} from "../../../../application/hooks/useSlackConnections";
import { CustomizableButton } from "../../../components/button/customizable-button";
import StandardModal from "../../../components/Modals/StandardModal";
import { palette, radiusPx } from "../../../themes/palette";
import { fill } from "../../../../i18n/fill";
import { channelLabel } from "./channelLabel";
import { SlackRoutingModal } from "./SlackRoutingModal";
import {
  buildSlackAuthorizeUrl,
  consumeSlackOAuthState,
  createSlackOAuthState,
  readSlackOAuthReturn,
} from "./slackOAuthState";

type Feedback = { severity: "success" | "error" | "info"; message: string };

/** A connection waiting for the remove confirmation. */
type PendingRemoval =
  | { kind: "linked"; connection: SlackConnection }
  | { kind: "unlinked"; connection: UnlinkedSlackConnection };

const ROWS_PER_PAGE_OPTIONS = [5, 10, 15, 25];

const headerCellSx = {
  backgroundColor: palette.background.alt,
  fontWeight: 600,
  fontSize: "12px",
  color: palette.text.tertiary,
  padding: "12px 16px",
};

const cellSx = {
  fontSize: "13px",
  color: palette.text.secondary,
  padding: "12px 16px",
  borderBottom: `1px solid ${palette.border.light}`,
  verticalAlign: "top",
};

const tableContainerSx = {
  border: `1px solid ${palette.border.dark}`,
  borderRadius: radiusPx.sm,
};

const actionButtonSx = { color: palette.text.tertiary };

function errorText(error: unknown, fallback: string): string {
  return getApiErrorReason(error) ?? fallback;
}

function StatusLabel({ active }: { active: boolean }) {
  const tone = active ? palette.status.success : palette.status.default;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: radiusPx.sm,
        fontSize: "12px",
        fontWeight: 500,
        backgroundColor: tone.bg,
        color: tone.text,
      }}
    >
      {active ? "Active" : "Inactive"}
    </Box>
  );
}

function RoutingSummary({ routing }: { routing?: string[] }) {
  if (!routing || routing.length === 0) {
    return <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>None</Typography>;
  }
  return (
    <Stack sx={{ gap: "2px" }}>
      {routing.map((type) => (
        <Typography key={type} sx={{ fontSize: "13px", color: palette.text.secondary }}>
          {type}
        </Typography>
      ))}
    </Stack>
  );
}

export default function SlackConfiguration() {
  const formatDate = useFormattedDate();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const { connections, loading, error: loadError } = useSlackConnections();
  const { unlinked, loading: unlinkedLoading } = useUnlinkedSlackConnections();
  const connectMutation = useConnectSlackWorkspace();
  const toggleMutation = useUpdateSlackConnection();
  const routingMutation = useUpdateSlackConnection();
  const removeMutation = useRemoveSlackConnection();
  const removeUnlinkedMutation = useRemoveUnlinkedSlackConnection();
  const connectWorkspace = connectMutation.mutateAsync;

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0]);
  const [routingConnection, setRoutingConnection] = useState<SlackConnection | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Set once the OAuth return in the URL has been handled, so React's
  // StrictMode double effect cannot POST the same code twice.
  const handledReturn = useRef(false);

  const connecting = connectMutation.isPending;
  const togglingId = toggleMutation.isPending ? toggleMutation.variables?.id : undefined;
  const removing = removeMutation.isPending || removeUnlinkedMutation.isPending;

  // After the list shrinks (e.g. the only row on the last page is removed),
  // move back to the last page that has rows, so the table never shows an
  // empty page without a pager.
  const lastPage = Math.max(0, Math.ceil(connections.length / rowsPerPage) - 1);
  if (page > lastPage) {
    setPage(lastPage);
  }
  const currentPage = Math.min(page, lastPage);

  // Slack sends the browser back here with ?code=&state= or ?error=.
  useEffect(() => {
    if (handledReturn.current) return;
    const result = readSlackOAuthReturn(location.search);
    if (result.kind === "none") return;
    handledReturn.current = true;
    // Clear the query string so a refresh cannot send the code again.
    navigate(location.pathname, { replace: true });

    if (result.kind === "error") {
      // This attempt is over: drop the stored state.
      consumeSlackOAuthState(null);
      setFeedback(
        result.error === "access_denied"
          ? { severity: "info", message: "Slack was not connected: the request was cancelled." }
          : {
              severity: "error",
              message: "Slack did not connect. Select Add to Slack to try again.",
            },
      );
      return;
    }

    if (!consumeSlackOAuthState(result.state)) {
      setFeedback({
        severity: "error",
        message: "This Slack sign-in could not be verified. Select Add to Slack to try again.",
      });
      return;
    }

    // The mutation refetches the connection list before it settles.
    connectWorkspace(result.code)
      .then(() => {
        setFeedback({ severity: "success", message: "Slack connected." });
      })
      .catch((error) => {
        setFeedback({
          severity: "error",
          message: errorText(error, "Could not connect Slack. Select Add to Slack to try again."),
        });
      });
  }, [location.pathname, location.search, navigate, connectWorkspace]);

  const handleAddToSlack = () => {
    const clientId = ENV_VARs.CLIENT_ID;
    if (!clientId) {
      setFeedback({ severity: "error", message: "The Slack client ID is not configured." });
      return;
    }
    const state = createSlackOAuthState();
    if (!state) {
      setFeedback({
        severity: "error",
        message: "Slack sign-in needs session storage, which this browser blocks.",
      });
      return;
    }
    window.location.assign(
      buildSlackAuthorizeUrl({
        baseUrl: ENV_VARs.SLACK_URL,
        clientId,
        origin: window.location.origin,
        state,
      }),
    );
  };

  const handleToggle = async (connection: SlackConnection) => {
    try {
      await toggleMutation.mutateAsync({
        id: connection.id,
        changes: { is_active: !connection.is_active },
      });
      setFeedback({
        severity: "success",
        message: connection.is_active ? "Connection turned off." : "Connection turned on.",
      });
    } catch (error) {
      setFeedback({
        severity: "error",
        message: errorText(error, "Could not update the connection."),
      });
    }
  };

  // Rejects with the message the routing dialog shows; the dialog stays open.
  const handleSaveRouting = async (connection: SlackConnection, routing: string[]) => {
    try {
      await routingMutation.mutateAsync({ id: connection.id, changes: { routing_type: routing } });
    } catch (error) {
      throw new Error(errorText(error, t("Could not save the notification routing.")));
    }
    setRoutingConnection(null);
    setFeedback({ severity: "success", message: "Notification routing saved." });
  };

  const closeRemoval = () => {
    if (removing) return;
    setPendingRemoval(null);
    setRemoveError(null);
  };

  const handleRemove = async () => {
    if (!pendingRemoval || removing) return;
    setRemoveError(null);
    try {
      if (pendingRemoval.kind === "linked") {
        await removeMutation.mutateAsync(pendingRemoval.connection.id);
      } else {
        await removeUnlinkedMutation.mutateAsync(pendingRemoval.connection.id);
      }
      setPendingRemoval(null);
      setFeedback({ severity: "success", message: "Connection removed." });
    } catch (error) {
      setRemoveError(errorText(error, "Could not remove the connection."));
    }
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const removalDescription = pendingRemoval
    ? fill(
        t(
          pendingRemoval.kind === "linked"
            ? "{channel} in {team} stops receiving VerifyWise notifications."
            : "This removes {channel} in {team}. It sends nothing now.",
        ),
        {
          channel: channelLabel(pendingRemoval.connection.channel),
          team: pendingRemoval.connection.team_name,
        },
      )
    : "";

  const visibleConnections = connections.slice(
    currentPage * rowsPerPage,
    (currentPage + 1) * rowsPerPage,
  );

  return (
    <Box>
      <Typography sx={{ fontSize: "13px", color: palette.text.secondary, mb: "24px" }}>
        Connect a Slack channel and choose which VerifyWise notifications it receives.
      </Typography>

      {feedback && (
        <Alert
          severity={feedback.severity}
          sx={{ mb: "16px", fontSize: "13px" }}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      <Stack direction="row" justifyContent="flex-end" sx={{ mb: "16px" }}>
        <ButtonBase
          onClick={handleAddToSlack}
          disabled={connecting}
          sx={{ borderRadius: radiusPx.sm }}
        >
          <img
            alt="Add to Slack"
            height="34"
            width="120"
            src="https://platform.slack-edge.com/img/add_to_slack.png"
            srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x"
          />
        </ButtonBase>
      </Stack>

      {loading || connecting ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: "16px", py: "32px" }}>
          <CircularProgress size={24} />
          <Typography sx={{ fontSize: "13px" }}>
            {connecting ? "Connecting Slack..." : "Loading Slack connections..."}
          </Typography>
        </Box>
      ) : loadError ? (
        <Alert severity="error" sx={{ fontSize: "13px" }}>
          {errorText(loadError, "Could not load the Slack connections.")}
        </Alert>
      ) : (
        <TableContainer sx={tableContainerSx}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={headerCellSx}>Team name</TableCell>
                <TableCell sx={headerCellSx}>Channel</TableCell>
                <TableCell sx={headerCellSx}>Notification routing</TableCell>
                <TableCell sx={headerCellSx}>Created</TableCell>
                <TableCell sx={headerCellSx}>Status</TableCell>
                <TableCell sx={headerCellSx}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {connections.length > 0 ? (
                visibleConnections.map((connection) => {
                  const channel = channelLabel(connection.channel);
                  return (
                    <TableRow key={connection.id} hover>
                      <TableCell sx={cellSx}>
                        <Typography sx={{ fontSize: "13px", color: palette.text.primary }}>
                          {connection.team_name}
                        </Typography>
                        {connection.delivery_scope === "user" && (
                          <Typography
                            sx={{ fontSize: "12px", color: palette.text.tertiary, mt: "4px" }}
                          >
                            Posts only its owner's events until you save its routing.
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={cellSx}>{channel}</TableCell>
                      <TableCell sx={cellSx}>
                        <RoutingSummary routing={connection.routing_type} />
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {connection.created_at ? formatDate(new Date(connection.created_at)) : "—"}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <StatusLabel active={connection.is_active} />
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <Stack direction="row" sx={{ gap: "4px" }}>
                          <CustomizableButton
                            iconOnly
                            variant="text"
                            title="Edit routing"
                            ariaLabel={fill(t("Edit routing for {channel}"), { channel })}
                            onClick={() => setRoutingConnection(connection)}
                            sx={actionButtonSx}
                          >
                            <SlidersHorizontal size={16} />
                          </CustomizableButton>
                          <CustomizableButton
                            iconOnly
                            variant="text"
                            title={connection.is_active ? "Turn off" : "Turn on"}
                            ariaLabel={fill(
                              t(connection.is_active ? "Turn off {channel}" : "Turn on {channel}"),
                              { channel },
                            )}
                            isDisabled={togglingId === connection.id}
                            onClick={() => handleToggle(connection)}
                            sx={actionButtonSx}
                          >
                            {connection.is_active ? (
                              <ToggleRight size={16} />
                            ) : (
                              <ToggleLeft size={16} />
                            )}
                          </CustomizableButton>
                          <CustomizableButton
                            iconOnly
                            variant="text"
                            title="Remove"
                            ariaLabel={fill(t("Remove {channel}"), { channel })}
                            onClick={() => setPendingRemoval({ kind: "linked", connection })}
                            sx={actionButtonSx}
                          >
                            <Trash2 size={16} />
                          </CustomizableButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: "40px" }}>
                    <Stack sx={{ alignItems: "center", gap: "8px" }}>
                      <MessageSquare size={16} color={palette.text.tertiary} />
                      <Typography
                        sx={{ fontSize: "13px", color: palette.text.secondary, fontWeight: 500 }}
                      >
                        No Slack connections yet
                      </Typography>
                      <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                        Select Add to Slack to connect a channel.
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {connections.length > ROWS_PER_PAGE_OPTIONS[0] && (
              <TableFooter>
                <TableRow>
                  <TablePagination
                    count={connections.length}
                    page={currentPage}
                    onPageChange={(_, next) => setPage(next)}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    labelRowsPerPage="Rows per page"
                    sx={{ fontSize: "13px" }}
                  />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>
      )}

      {!unlinkedLoading && unlinked.length > 0 && (
        <Box component="section" aria-labelledby="slack-unlinked-heading" sx={{ mt: "32px" }}>
          <Typography
            id="slack-unlinked-heading"
            component="h3"
            sx={{ fontSize: "14px", fontWeight: 600, color: palette.text.primary, mb: "4px" }}
          >
            Unlinked connections
          </Typography>
          <Typography sx={{ fontSize: "13px", color: palette.text.secondary, mb: "16px" }}>
            These connections were created before connections belonged to an organization. They send
            nothing. Remove them, then add Slack again if you still need it.
          </Typography>
          <TableContainer sx={tableContainerSx}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={headerCellSx}>Team name</TableCell>
                  <TableCell sx={headerCellSx}>Channel</TableCell>
                  <TableCell sx={headerCellSx}>Created</TableCell>
                  <TableCell sx={headerCellSx}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unlinked.map((connection) => {
                  const channel = channelLabel(connection.channel);
                  return (
                    <TableRow key={connection.id} hover>
                      <TableCell sx={cellSx}>{connection.team_name}</TableCell>
                      <TableCell sx={cellSx}>{channel}</TableCell>
                      <TableCell sx={cellSx}>
                        {connection.created_at ? formatDate(new Date(connection.created_at)) : "—"}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <CustomizableButton
                          iconOnly
                          variant="text"
                          title="Remove"
                          ariaLabel={fill(t("Remove {channel}"), { channel })}
                          onClick={() => setPendingRemoval({ kind: "unlinked", connection })}
                          sx={actionButtonSx}
                        >
                          <Trash2 size={16} />
                        </CustomizableButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {routingConnection && (
        <SlackRoutingModal
          key={routingConnection.id}
          connection={routingConnection}
          onClose={() => setRoutingConnection(null)}
          onSave={handleSaveRouting}
        />
      )}

      <StandardModal
        isOpen={Boolean(pendingRemoval)}
        onClose={closeRemoval}
        title="Remove Slack connection?"
        description={removalDescription}
        onSubmit={handleRemove}
        submitButtonText="Remove"
        submitButtonColor={palette.status.error.text}
        isSubmitting={removing}
        maxWidth="600px"
        fitContent
      >
        {removeError ? (
          <Alert severity="error" sx={{ fontSize: "13px" }}>
            {removeError}
          </Alert>
        ) : undefined}
      </StandardModal>
    </Box>
  );
}
