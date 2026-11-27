import React, { useCallback, useState } from "react";
import { Box, IconButton, Stack, Typography, useTheme } from "@mui/material";
import { Check as CheckIcon, Copy as CopyIcon, KeyRound as KeyIcon } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Alert from "../../../components/Alert";
import Select from "../../../components/Inputs/Select";
import {
  createApiToken,
  getApiTokens,
  revokeApiToken,
} from "../../../../application/repository/tokens.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useMcpTools } from "../../../../application/hooks/useMcpTools";
import {
  useMcpConnections,
  useRevokeMcpConnection,
} from "../../../../application/hooks/useMcpOAuth";
import { formatRelativeDate } from "../../../../application/utils/dateFormatter";
import { radiusPx } from "../../../themes/palette";

const SERVER_NAME = "verifywise";
/** Tokens this tab issues are named with this prefix, so it can clean up its own. */
const TOKEN_NAME_PREFIX = "Claude Code MCP";

/** The same expiry choices the API keys page offers; this mints the same kind of token. */
const EXPIRY_ITEMS = [
  { _id: 7, name: "7 days" },
  { _id: 30, name: "30 days" },
  { _id: 60, name: "60 days" },
  { _id: 90, name: "90 days" },
  { _id: 180, name: "180 days" },
];

/** Read-only command block with a copy button. */
const Snippet: React.FC<{ value: string; label: string; testId: string }> = ({
  value,
  label,
  testId,
}) => {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.accent,
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: radiusPx.sm,
        p: 2.5,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 2,
      }}
    >
      <Typography
        component="pre"
        data-testid={testId}
        sx={{
          fontSize: 13,
          fontFamily: "monospace",
          color: theme.palette.text.primary,
          whiteSpace: "pre-wrap",
          // break-word, not break-all: a command split mid-flag ("--h / eader")
          // is unreadable and uncopyable by eye.
          wordBreak: "break-word",
          flex: 1,
          m: 0,
        }}
      >
        {value}
      </Typography>
      <IconButton
        onClick={handleCopy}
        disableRipple
        aria-label={`Copy ${label}`}
        data-testid={`${testId}-copy`}
        sx={{
          "color": copied ? theme.palette.primary.main : theme.palette.text.secondary,
          "&:hover": { color: theme.palette.primary.main, backgroundColor: "transparent" },
        }}
      >
        {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
      </IconButton>
    </Box>
  );
};

/** Bordered reference block for the column beside the steps. */
const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const theme = useTheme();
  return (
    <Stack gap={theme.spacing(4)}>
      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{title}</Typography>
      <Box
        sx={{
          backgroundColor: theme.palette.background.accent,
          border: `1px solid ${theme.palette.border.dark}`,
          borderRadius: radiusPx.sm,
          p: 2.5,
        }}
      >
        {children}
      </Box>
    </Stack>
  );
};

const Step: React.FC<{ number: number; title: string; children: React.ReactNode }> = ({
  number,
  title,
  children,
}) => {
  const theme = useTheme();
  return (
    <Stack gap={theme.spacing(2)}>
      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
        {number}. {title}
      </Typography>
      {children}
    </Stack>
  );
};

interface McpConnectProps {
  /** Shown as an info alert, with token creation turned off, when this tab is not the one to use. */
  disabledReason?: string;
}

/**
 * How to point an MCP client at this deployment.
 *
 * There is nothing to install: the MCP server is served by this deployment at
 * /api/mcp. Connecting is one command, then signing in through the browser
 * (Servers/mcp/oauth.ts); for a client without browser sign-in, a command
 * carrying an API token. The endpoint is derived from the current origin
 * rather than configured, so the commands shown are always correct for
 * whichever deployment the operator is looking at.
 *
 * What a connection can do is decided in one place, toolsFor in
 * Servers/mcp/server.ts, from the user the token belongs to. This page shows
 * the server's own answer for the signed-in user (useMcpTools) rather than a
 * list of its own.
 */
const McpConnect: React.FC<McpConnectProps> = ({ disabledReason }) => {
  const theme = useTheme();
  const { userId } = useAuth();
  const { data: tools, isLoading: toolsLoading, isError: toolsFailed } = useMcpTools();
  const endpoint = `${window.location.origin}/api/mcp`;
  const { data: connections, isLoading: connectionsLoading } = useMcpConnections();
  const revokeConnection = useRevokeMcpConnection();

  const [expiryDays, setExpiryDays] = useState<number>(90);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held only in this component's state: it is gone once the operator leaves
  // the tab, and the API returns the raw value just once.
  const [token, setToken] = useState<string | null>(null);

  // claude mcp add refuses an existing name, so a user who added VerifyWise
  // before (to rotate a token, or to switch between sign-in and a token)
  // removes the old entry first. --scope user keeps the connection out of
  // project files that teams commit.
  const removeCommand = `claude mcp remove ${SERVER_NAME} -s user`;
  const addCommand = `claude mcp add --transport http --scope user ${SERVER_NAME} ${endpoint}`;
  const commandFor = (bearer: string) => `${addCommand} --header "Authorization: Bearer ${bearer}"`;

  /**
   * Revoke still-valid tokens this tab issued earlier for this user.
   *
   * Best-effort: a cleanup failure must not stop the operator getting a working
   * command, so anything that goes wrong here is swallowed. Only this
   * user's tokens carrying this tab's own name prefix are touched — never one
   * created by hand on the API keys page, nor another administrator's: the
   * token list holds every token of the organization (or, for super admins,
   * of every super admin).
   */
  const revokePreviousTokens = useCallback(async () => {
    try {
      const response = await getApiTokens({ routeUrl: "/tokens" });
      const existing: any[] = response?.data?.data ?? [];
      const mine = existing.filter(
        (t) =>
          typeof t?.name === "string" &&
          t.name.startsWith(TOKEN_NAME_PREFIX) &&
          t.created_by === userId &&
          !t.revoked,
      );
      await Promise.all(
        mine.map((t) =>
          revokeApiToken({ routeUrl: `/tokens/${t.id}/revoke` }).catch(() => undefined),
        ),
      );
    } catch {
      // Ignored: cleanup is housekeeping, not part of issuing the token.
    }
  }, [userId]);

  /**
   * Mint a token and show a ready-to-run command that carries it.
   *
   * The token is minted through the ordinary API-keys endpoint, so it appears
   * in that list and can be revoked there like any other.
   */
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setToken(null);
    try {
      // Revoke the token this tab issued last time before minting another.
      // A replaced command leaves its old token behind otherwise, and those
      // accumulate against the per-organization token limit.
      await revokePreviousTokens();

      // Active token names must be unique, so the moment of issue names it.
      const name = `${TOKEN_NAME_PREFIX} ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
      const response = await createApiToken({
        routeUrl: "/tokens",
        body: { name, expires_in_days: expiryDays },
      });

      const created = response?.data?.data?.token;
      if (!created) {
        throw new Error("The server did not return a token.");
      }
      setToken(created);
    } catch (err: any) {
      setError(
        err?.response?.data?.data ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to create the token.",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [expiryDays, revokePreviousTokens]);

  return (
    <Stack gap={theme.spacing(8)} sx={{ pt: 4 }}>
      {disabledReason && <Alert variant="info" body={disabledReason} isToast={false} inline />}

      <Stack
        direction={{ xs: "column", lg: "row" }}
        alignItems="flex-start"
        gap={theme.spacing(12)}
      >
        <Stack sx={{ flex: 1, minWidth: 0, maxWidth: 640 }} gap={theme.spacing(8)}>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            Use VerifyWise from Claude Code, or any MCP client, with the tools listed on the right.
            The server runs here — nothing is installed on your machine.
          </Typography>

          <Step number={1} title="Add VerifyWise to Claude Code">
            <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
              Run this in a terminal. It adds VerifyWise for your user account, so it works in every
              project.
            </Typography>
            <Snippet value={addCommand} label="sign-in command" testId="mcp-sign-in-command" />
            <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
              Added VerifyWise to Claude Code before? If it says{" "}
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                already exists in user config
              </Box>
              , run this, then the command above again.
            </Typography>
            <Snippet value={removeCommand} label="remove command" testId="mcp-remove-command" />
          </Step>

          <Step number={2} title="Sign in">
            <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
              In Claude Code, run{" "}
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                /mcp
              </Box>
              , choose{" "}
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                {SERVER_NAME}
              </Box>{" "}
              and authenticate. Your browser opens VerifyWise: check the organization and allow
              Claude Code. It stays signed in until you disconnect it under Connected clients.
            </Typography>
          </Step>

          <Step number={3} title="Check it worked">
            <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                /mcp
              </Box>{" "}
              should list{" "}
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                {SERVER_NAME}
              </Box>{" "}
              as connected, with the tools shown under Tools it adds.
            </Typography>
          </Step>

          <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary }}>
            To administer more than one deployment, repeat this on each and change{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {SERVER_NAME}
            </Box>{" "}
            in both commands to a different name per deployment, for example{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              verifywise-test
            </Box>{" "}
            and{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              verifywise-prod
            </Box>
            .
          </Typography>

          <Stack gap={theme.spacing(4)}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
              Connect with a token instead
            </Typography>
            <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
              For an MCP client without browser sign-in. This creates an API token for you and puts
              it into a command already pointed at this deployment. The token is shown only here and
              only until you leave this tab. Anyone who has the command can do everything those
              tools allow, as you, so don't share it. Your shell keeps the command in its history,
              token included.
            </Typography>

            {error && (
              <Box sx={{ mb: 2 }}>
                <Alert
                  variant="error"
                  body={error}
                  isToast={false}
                  onClick={() => setError(null)}
                  inline
                />
              </Box>
            )}

            <Alert
              variant="info"
              body="Creating a command revokes the token issued to you here last time. Anything set up with the previous command, on this machine or another, stops working immediately."
              isToast={false}
              inline
            />
            <Box sx={{ maxWidth: 200 }}>
              <Select
                id="mcp-token-expiry"
                label="Token expires in"
                value={expiryDays}
                items={EXPIRY_ITEMS}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                disabled={Boolean(disabledReason)}
              />
            </Box>
            <Box>
              <CustomizableButton
                variant="contained"
                text={isGenerating ? "Preparing..." : "Create command"}
                icon={<KeyIcon size={16} />}
                onClick={handleGenerate}
                isDisabled={isGenerating || Boolean(disabledReason)}
              />
            </Box>
            {token ? (
              <>
                <Snippet value={commandFor(token)} label="add command" testId="mcp-add-command" />
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  Added VerifyWise to Claude Code before? If it says{" "}
                  <Box component="span" sx={{ fontFamily: "monospace" }}>
                    already exists in user config
                  </Box>
                  , run this, then the command above again.
                </Typography>
                <Snippet
                  value={removeCommand}
                  label="remove command"
                  testId="mcp-token-remove-command"
                />
              </>
            ) : (
              <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary }}>
                Your command appears here once it is created.
              </Typography>
            )}
          </Stack>
        </Stack>

        <Stack gap={theme.spacing(8)} sx={{ width: { xs: "100%", lg: 380 }, flexShrink: 0 }}>
          <Panel title="Tools it adds">
            {toolsLoading ? (
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                Loading the tools…
              </Typography>
            ) : toolsFailed || !tools ? (
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                Couldn't load the tool list. Reload the page to try again.
              </Typography>
            ) : (
              <Stack gap="6px">
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  {tools.length} tools for your account
                </Typography>
                {tools.map((tool) => (
                  <Typography
                    key={tool.name}
                    sx={{
                      fontSize: 12,
                      fontFamily: "monospace",
                      color: theme.palette.text.secondary,
                    }}
                  >
                    {tool.name}
                  </Typography>
                ))}
              </Stack>
            )}
          </Panel>

          <Panel title="Connected clients">
            {connectionsLoading ? (
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                Loading…
              </Typography>
            ) : !connections?.length ? (
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                No clients signed in yet.
              </Typography>
            ) : (
              <Stack gap={theme.spacing(4)}>
                {connections.map((connection) => (
                  <Stack
                    key={connection.id}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    gap={theme.spacing(4)}
                  >
                    <Stack sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
                        {connection.client_name || "MCP client"}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                        {connection.organization_name ?? "No organization"} · signed in{" "}
                        {formatRelativeDate(connection.created_at)}
                        {connection.last_used_at
                          ? ` · last used ${formatRelativeDate(connection.last_used_at)}`
                          : ""}
                      </Typography>
                    </Stack>
                    <CustomizableButton
                      variant="outlined"
                      size="small"
                      text="Disconnect"
                      onClick={() => revokeConnection.mutate(connection.id)}
                      isDisabled={revokeConnection.isPending}
                    />
                  </Stack>
                ))}
              </Stack>
            )}
          </Panel>
        </Stack>
      </Stack>
    </Stack>
  );
};

export default McpConnect;
