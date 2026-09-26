import React, { useCallback, useEffect, useState } from "react";
import { Box, CircularProgress, IconButton, Stack, Typography, useTheme } from "@mui/material";
import {
  Check as CheckIcon,
  Copy as CopyIcon,
  Download as InstallIcon,
  Trash2 as UninstallIcon,
} from "lucide-react";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import Alert from "../../../../components/Alert";
import {
  getMcpServerStatus,
  installMcpServer,
  uninstallMcpServer,
  type McpServerStatus,
} from "../../../../../application/repository/superAdmin.repository";

const SERVER_NAME = "verifywise";

interface SnippetProps {
  value: string;
  label: string;
  testId: string;
}

/** Read-only command block with a copy button. */
const Snippet: React.FC<SnippetProps> = ({ value, label, testId }) => {
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
        borderRadius: "4px",
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
          wordBreak: "break-all",
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

/**
 * Install the MCP server on this deployment and register it with an MCP client.
 *
 * The server source ships with the backend; installing builds it in place. The
 * registration command is shown only once the build exists, with the real path
 * the backend reports  there is nothing for an operator to fill in.
 */
const McpServer: React.FC = () => {
  const theme = useTheme();
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await getMcpServerStatus();
      setStatus(res.data?.data ?? null);
    } catch {
      setError("Failed to read the MCP server status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setError(null);
    try {
      const res = await installMcpServer();
      setStatus(res.data?.data ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.data?.message || "Failed to install the MCP server.");
    } finally {
      setInstalling(false);
    }
  }, []);

  const handleUninstall = useCallback(async () => {
    setUninstalling(true);
    setError(null);
    try {
      const res = await uninstallMcpServer();
      // apiServices.delete already unwraps the { message, data } envelope,
      // unlike get and post which hand back the raw body.
      setStatus(res.data ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.data?.message || "Failed to uninstall the MCP server.");
    } finally {
      setUninstalling(false);
    }
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", pt: 10 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const registerCommand = status?.entryPoint
    ? `claude mcp add ${SERVER_NAME} -- node "${status.entryPoint}"`
    : "";

  return (
    <Stack sx={{ pt: 4, maxWidth: 680 }} gap={theme.spacing(8)}>
      <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
        Manage organizations and users on this deployment from Claude Code. The MCP server ships
        with the backend. Installing builds it and registers it with the Claude Code CLI on this
        machine.
      </Typography>

      {error && (
        <Box>
          <Alert variant="error" body={error} isToast={false} onClick={() => setError(null)} />
        </Box>
      )}

      {status && !status.sourcePresent && (
        <Alert
          variant="warning"
          body="The MCP server source was not found next to the backend. It is included from MCPServer/ at build time."
          isToast={false}
        />
      )}

      {status?.sourcePresent && !status.installed && (
        <Stack gap={theme.spacing(3)}>
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Install</Typography>
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
            {status.canInstall
              ? "Builds the server on this deployment. A cold install takes a minute or two."
              : "npm is not available in this environment, so the server cannot be built here. It is built into the published image instead."}
          </Typography>
          <Box>
            <CustomizableButton
              variant="contained"
              text={installing ? "Installing..." : "Install MCP server"}
              icon={<InstallIcon size={16} />}
              onClick={handleInstall}
              isDisabled={installing || !status.canInstall}
            />
          </Box>
        </Stack>
      )}

      {status?.installed && (
        <>
          <Stack gap={theme.spacing(3)}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Installed</Typography>
            {status.registered ? (
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                Registered with Claude Code as{" "}
                <Box component="span" sx={{ fontFamily: "monospace" }}>
                  {SERVER_NAME}
                </Box>{" "}
                at user scope, so it is available in every project. Restart Claude Code and it
                appears under{" "}
                <Box component="span" sx={{ fontFamily: "monospace" }}>
                  /mcp
                </Box>
                .
              </Typography>
            ) : (
              <>
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  Built, but not registered &mdash; the Claude Code CLI is not on this machine. Run
                  this where your client runs, then restart it.
                </Typography>
                <Snippet
                  value={registerCommand}
                  label="registration command"
                  testId="mcp-register-command"
                />
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  The path is on the machine running this backend, so it only works for a client on
                  that same machine.
                </Typography>
              </>
            )}
          </Stack>

          <Stack gap={theme.spacing(3)}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Uninstall</Typography>
            <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
              Removes the build and its dependencies, and deregisters it from Claude Code on this
              machine. The source stays, so you can install it again from here.
            </Typography>
            <Box>
              <CustomizableButton
                variant="outlined"
                text={uninstalling ? "Uninstalling..." : "Uninstall MCP server"}
                icon={<UninstallIcon size={16} />}
                onClick={handleUninstall}
                isDisabled={uninstalling}
              />
            </Box>
          </Stack>
        </>
      )}
    </Stack>
  );
};

export default McpServer;
