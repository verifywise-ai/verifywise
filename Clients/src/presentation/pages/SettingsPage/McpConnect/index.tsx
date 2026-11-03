import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, IconButton, Stack, Typography, useTheme } from "@mui/material";
import { Check as CheckIcon, Copy as CopyIcon, Download as DownloadIcon } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Alert from "../../../components/Alert";
import Select from "../../../components/Inputs/Select";
import {
  createApiToken,
  getApiTokens,
  revokeApiToken,
} from "../../../../application/repository/tokens.repository";
import { useAuth } from "../../../../application/hooks/useAuth";

const SERVER_NAME = "verifywise";
const TOKEN_PLACEHOLDER = "<your-api-token>";
// Deliberately not ".mcp.json": that is Claude Code's project config, which
// teams commit, and this file holds an administrator's token. The file is a
// single server entry for `claude mcp add-json`, which stores it in the user's
// own Claude Code config, outside any repository.
const CONFIG_FILENAME = "verifywise-mcp.json";
/** Tokens this tab issues are named with this prefix, so it can clean up its own. */
const TOKEN_NAME_PREFIX = "Claude Code MCP";

/** Shown in the reference panel so the operator knows what they are saving. */
const FILE_PREVIEW = `{
  "type": "http",
  "url": "<this deployment>/api/mcp",
  "headers": {
    "Authorization": "Bearer <token>"
  }
}`;

const GOVERNANCE_TOOL_NAMES = [
  "list_use_cases",
  "get_use_case",
  "create_use_case",
  "update_use_case",
  "list_risks",
  "get_risk",
  "create_risk",
  "update_risk",
  "list_frameworks",
  "get_compliance_posture",
];

/**
 * What the server offers each kind of caller (Servers/mcp/server.ts): a super
 * admin the whole deployment, an organization Admin their own organization.
 */
const SCOPES = {
  deployment: {
    intro:
      "Manage the organizations on this deployment and the users in them from Claude Code, or any MCP client.",
    fileWarning: "Anyone who has the file can administer every organization here",
    coverage: "organizations and users",
    tools: [
      "list_organizations",
      "create_organization_with_admin",
      "update_organization",
      "delete_organization",
      "list_users",
      "create_user",
      "invite_user",
      "list_invitations",
      "update_user",
      "remove_user",
      "delete_user",
    ],
  },
  organization: {
    intro:
      "Manage your organization's members, use cases, risks, incidents and compliance posture, and look up its vendors, policies, models, tasks, trainings and datasets, from Claude Code or any MCP client.",
    fileWarning: "Anyone who has the file can act as you in this organization",
    coverage:
      "members, use cases, risks, compliance posture, vendors, policies, models, incidents, tasks, trainings and datasets",
    tools: [
      "list_users",
      "invite_user",
      "update_user_role",
      "remove_user",
      ...GOVERNANCE_TOOL_NAMES,
      "list_vendors",
      "list_policies",
      "list_models",
      "list_incidents",
      "update_incident",
      "list_tasks",
      "list_trainings",
      "list_datasets",
    ],
  },
};

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
          borderRadius: "4px",
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
  /** "deployment" in the super admin console, "organization" in an Admin's settings. */
  scope: keyof typeof SCOPES;
}

/**
 * How to point an MCP client at this deployment.
 *
 * There is nothing to install: the MCP server is served by this deployment at
 * /api/mcp, so connecting is one command plus an API token. The endpoint is
 * derived from the current origin rather than configured, so the command shown
 * is always correct for whichever deployment the operator is looking at.
 *
 * The server decides from the token which tools it offers; scope only says
 * which of those this page describes.
 */
const McpConnect: React.FC<McpConnectProps> = ({ scope }) => {
  const theme = useTheme();
  const { userId } = useAuth();
  const { intro, fileWarning, coverage, tools } = SCOPES[scope];
  const endpoint = `${window.location.origin}/api/mcp`;
  const command = `claude mcp add --transport http ${SERVER_NAME} ${endpoint} --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`;
  // $(cat ...) keeps the token out of shell history: only this literal is recorded.
  // add-json refuses an existing name, so the old entry is removed first; that
  // makes the same command work for a first setup and after a token rotation.
  const addFileCommand = `claude mcp remove ${SERVER_NAME} -s user 2>/dev/null; claude mcp add-json ${SERVER_NAME} --scope user "$(cat ${CONFIG_FILENAME})"`;

  const [expiryDays, setExpiryDays] = useState<number>(90);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  // The confirmation clears itself; a permanent banner just pushes the rest of
  // the page down long after it has been read.
  const downloadedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (downloadedTimer.current) clearTimeout(downloadedTimer.current);
    },
    [],
  );

  /**
   * Revoke still-valid tokens this tab issued earlier for this user.
   *
   * Best-effort: a cleanup failure must not stop the operator getting a working
   * config file, so anything that goes wrong here is swallowed. Only this
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
   * Mint a token and hand back a ready-to-use config file.
   *
   * The token is minted through the ordinary API-keys endpoint, so it appears
   * in that list and can be revoked there like any other. The raw value is
   * returned once and goes straight into the file — it is never rendered, and
   * nothing here keeps a copy.
   */
  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // Revoke the token this tab issued last time before minting another.
      // A replaced config file leaves its old token behind otherwise, and
      // those accumulate against the per-organization token limit.
      await revokePreviousTokens();

      // Active token names must be unique, so the moment of issue names it.
      const name = `${TOKEN_NAME_PREFIX} ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
      const response = await createApiToken({
        routeUrl: "/tokens",
        body: { name, expires_in_days: expiryDays },
      });

      const token = response?.data?.data?.token;
      if (!token) {
        throw new Error("The server did not return a token.");
      }

      const config = {
        type: "http",
        url: endpoint,
        headers: { Authorization: `Bearer ${token}` },
      };

      const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = CONFIG_FILENAME;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloaded(true);
      if (downloadedTimer.current) clearTimeout(downloadedTimer.current);
      downloadedTimer.current = setTimeout(() => setDownloaded(false), 4000);
    } catch (err: any) {
      setError(
        err?.response?.data?.data ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to create the config file.",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [endpoint, expiryDays, revokePreviousTokens]);

  return (
    <Stack
      direction={{ xs: "column", lg: "row" }}
      alignItems="flex-start"
      gap={theme.spacing(12)}
      sx={{ pt: 4 }}
    >
      <Stack sx={{ flex: 1, minWidth: 0, maxWidth: 640 }} gap={theme.spacing(8)}>
        <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
          {intro} The server runs here — nothing is installed on your machine, and the connection is
          authorized by an API token you create below.
        </Typography>

        {error && (
          <Box sx={{ mb: 2 }}>
            <Alert
              variant="error"
              body={error}
              isToast={false}
              onClick={() => setError(null)}
              sx={{ position: "static" }}
            />
          </Box>
        )}

        <Step number={1} title="Download the config file">
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
            This creates an API token for you and puts it straight into a{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {CONFIG_FILENAME}
            </Box>{" "}
            file, already pointed at this deployment. The token is shown nowhere else. {fileWarning}
            , so delete it once it is added.
          </Typography>
          <Alert
            variant="info"
            body="Downloading revokes the token issued to you here last time. Anything set up with the previous file, on this machine or another, stops working immediately."
            isToast={false}
            sx={{ position: "static" }}
          />
          <Box sx={{ maxWidth: 200 }}>
            <Select
              id="mcp-token-expiry"
              label="Token expires in"
              value={expiryDays}
              items={EXPIRY_ITEMS}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
            />
          </Box>
          <Box>
            <CustomizableButton
              variant="contained"
              text={isGenerating ? "Preparing..." : "Download config file"}
              icon={<DownloadIcon size={16} />}
              onClick={handleDownload}
              isDisabled={isGenerating}
            />
          </Box>
          {downloaded && (
            <Stack direction="row" alignItems="center" gap="6px">
              <CheckIcon size={14} color={theme.palette.primary.main} />
              <Typography sx={{ fontSize: 12, color: theme.palette.primary.main }}>
                Config file downloaded
              </Typography>
            </Stack>
          )}
        </Step>

        <Step number={2} title="Add it to Claude Code">
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
            Run this in the folder you downloaded the file to. It adds VerifyWise to Claude Code for
            your user account, so it works in every project and the token stays out of project files
            that might be committed. Then delete the file.
          </Typography>
          <Snippet value={addFileCommand} label="add command" testId="mcp-add-file-command" />
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
            Prefer a command, or using a client other than Claude Code? Create a token on the API
            keys tab and run this instead:
          </Typography>
          <Snippet value={command} label="connect command" testId="mcp-connect-command" />
        </Step>

        <Step number={3} title="Check it worked">
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
            Restart Claude Code and run{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              /mcp
            </Box>
            .{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {SERVER_NAME}
            </Box>{" "}
            should be listed with {tools.length} tools, covering {coverage}.
          </Typography>
        </Step>

        <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary }}>
          To administer more than one deployment, repeat this on each and change{" "}
          <Box component="span" sx={{ fontFamily: "monospace" }}>
            {SERVER_NAME}
          </Box>{" "}
          in both places in the command to a different name per deployment, for example{" "}
          <Box component="span" sx={{ fontFamily: "monospace" }}>
            verifywise-test
          </Box>{" "}
          and{" "}
          <Box component="span" sx={{ fontFamily: "monospace" }}>
            verifywise-prod
          </Box>
          .
        </Typography>
      </Stack>

      <Stack gap={theme.spacing(8)} sx={{ width: { xs: "100%", lg: 380 }, flexShrink: 0 }}>
        <Panel title="What the file contains">
          <Typography
            component="pre"
            sx={{
              fontSize: 12,
              fontFamily: "monospace",
              color: theme.palette.text.secondary,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              m: 0,
            }}
          >
            {FILE_PREVIEW}
          </Typography>
        </Panel>

        <Panel title="Tools it adds">
          <Stack gap="6px">
            {tools.map((tool) => (
              <Typography
                key={tool}
                sx={{ fontSize: 12, fontFamily: "monospace", color: theme.palette.text.secondary }}
              >
                {tool}
              </Typography>
            ))}
          </Stack>
        </Panel>
      </Stack>
    </Stack>
  );
};

export default McpConnect;
