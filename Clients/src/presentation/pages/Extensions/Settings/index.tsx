import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Box, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import { ChevronLeft } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { useExtensions } from "../../../../application/contexts/Extensions.context";
import {
  ExtensionConfigForm,
  ExtensionConfigFormValues,
  initialFormValues,
  OptionalNotice,
  prepareSubmitValues,
} from "../../../components/ExtensionConfigForm";
import {
  getExtensionByKey,
  testExtensionConnection,
} from "../../../../application/repository/extension.repository";
import { Extension } from "../../../../domain/types/extensions";
import SlackConfiguration from "../slack/SlackConfiguration";
import ModelLifecycleConfig from "../model-lifecycle/ModelLifecycleConfig";
import { JiraAssetsConfiguration } from "../jira-assets/JiraAssetsConfiguration";
import { JiraIncidentsConfiguration } from "../jira-incidents/JiraIncidentsConfiguration";
import { useCan, usePermissionsSettled } from "../../../../application/hooks/useCan";
import { palette, radiusPx, status } from "../../../themes/palette";
import ConfirmDisableModal from "../ConfirmDisableModal";
import {
  EXTENSION_DISABLED_MESSAGE,
  EXTENSION_ENABLED_MESSAGE,
  humanizeCategory,
} from "../catalogCopy";

// Enable and disable feedback is one full sentence per extension so it
// translates as a whole. An extension missing from the map shows its name
// and the status word as separate nodes, so the word still translates.
function toggledMessage(extension: Extension, action: "enabled" | "disabled"): ReactNode {
  const sentences = action === "enabled" ? EXTENSION_ENABLED_MESSAGE : EXTENSION_DISABLED_MESSAGE;
  const sentence = sentences[extension.key];
  if (sentence) return sentence;
  return (
    <>
      <span>{extension.displayName}</span> <span>{action}</span>.
    </>
  );
}

/**
 * Per-extension settings page — /extensions/:key/settings.
 * Config form + Enable/Disable + Test connection for extensions with
 * pre-enable fields (MLflow, Azure AI Foundry). The panels of Slack, Jira
 * and Model lifecycle carry their own connection checks.
 *
 * `formValues` starts from the stored configuration, so an untouched form
 * sends the stored values; the server keeps any field left out and clears a
 * field sent as `null` (see `prepareSubmitValues`). After a successful Enable
 * or Save the form is reseeded from the response. Disable does not reseed,
 * so unsaved edits stay in the form.
 *
 * The initial fetch uses `getExtensionByKey` (fresh from the server so we
 * see the latest `configuration` shape). Enable/disable/updateConfiguration
 * go through the Extensions context so the list-page cache stays fresh.
 */
export default function ExtensionSettingsPage() {
  const theme = useTheme();
  const { key } = useParams();
  const navigate = useNavigate();
  const canManageExtensions = useCan("extension.admin");
  const permissionsSettled = usePermissionsSettled();
  const { enable, disable, updateConfiguration, getByKey } = useExtensions();

  const [extension, setExtension] = useState<Extension | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ExtensionConfigFormValues>({});
  // Bumped to remount the form after a successful Enable/Save, so it shows
  // what is now stored (a newly stored secret reads "Stored").
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState<"enable" | "disable" | "save" | "test" | null>(null);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    severity: "success" | "error" | "info";
    message: ReactNode;
  } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const reseedForm = useCallback((ext: Extension) => {
    setFormValues(initialFormValues(ext.configFields ?? [], ext.configuration ?? {}));
    setFormKey((k) => k + 1);
    // A result for the values before the save no longer applies.
    setTestResult(null);
  }, []);

  // A connection result describes the values it tested, so an edit clears it.
  const handleFormChange = useCallback((values: ExtensionConfigFormValues) => {
    setFormValues(values);
    setTestResult(null);
  }, []);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const ext = await getExtensionByKey({ key });
      setExtension(ext);
      reseedForm(ext);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load extension");
    } finally {
      setLoading(false);
    }
  }, [key, reseedForm]);

  useEffect(() => {
    load();
  }, [load]);

  // When the shared context has this extension (fresh from a previous list
  // fetch), prefer its enablement row so mutations on the list page reflect
  // here without a round-trip. Compare on the enablement `updatedAt` since
  // that's what changes on enable/disable/updateConfiguration.
  const contextExt = key ? getByKey(key) : undefined;
  useEffect(() => {
    if (!contextExt || !extension) return;
    const ctxUpdated = contextExt.enablement?.updatedAt ?? null;
    const currentUpdated = extension.enablement?.updatedAt ?? null;
    if (ctxUpdated !== currentUpdated) {
      setExtension(contextExt);
    }
  }, [contextExt, extension]);

  const configFields = useMemo(() => extension?.configFields ?? [], [extension]);

  const handleEnable = async () => {
    if (!extension) return;
    setBusy("enable");
    setFeedback(null);
    try {
      const submit = prepareSubmitValues(configFields, formValues);
      const next = await enable(extension.key, submit);
      setExtension(next);
      reseedForm(next);
      setFeedback({ severity: "success", message: toggledMessage(extension, "enabled") });
    } catch (err: any) {
      setFeedback({
        severity: "error",
        message: err?.response?.data?.data?.message ?? err?.message ?? "Enable failed",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDisable = async () => {
    if (!extension) return;
    setBusy("disable");
    setFeedback(null);
    try {
      const next = await disable(extension.key);
      // No reseed: unsaved edits stay in the form for the next Enable.
      setExtension(next);
      setFeedback({ severity: "success", message: toggledMessage(extension, "disabled") });
    } catch (err: any) {
      setFeedback({
        severity: "error",
        message: err?.response?.data?.data?.message ?? err?.message ?? "Disable failed",
      });
    } finally {
      setBusy(null);
      setConfirmDisableOpen(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!extension) return;
    setBusy("save");
    setFeedback(null);
    try {
      const submit = prepareSubmitValues(configFields, formValues);
      const next = await updateConfiguration(extension.key, submit);
      setExtension(next);
      reseedForm(next);
      setFeedback({ severity: "success", message: "Configuration saved." });
    } catch (err: any) {
      setFeedback({
        severity: "error",
        message: err?.response?.data?.data?.message ?? err?.message ?? "Save failed",
      });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    if (!extension) return;
    setBusy("test");
    setTestResult(null);
    try {
      const submit = prepareSubmitValues(configFields, formValues);
      const result = await testExtensionConnection({ key: extension.key, configuration: submit });
      setTestResult({ success: result.success, message: result.message });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.response?.data?.data?.message ?? err?.message ?? "Test failed",
      });
    } finally {
      setBusy(null);
    }
  };

  if (!permissionsSettled) return null;
  if (!canManageExtensions) {
    return <Navigate to="/" replace />;
  }

  const statusStyles = extension?.enabled
    ? {
        bg: theme.palette.status.success.bg,
        border: theme.palette.status.success.border ?? theme.palette.status.success.main,
        text: theme.palette.status.success.text,
        label: "Enabled",
      }
    : {
        bg: status.default.bg,
        border: status.default.border,
        text: status.default.text,
        label: "Disabled",
      };

  return (
    <PageHeaderExtended
      title={extension?.displayName ?? "Extension"}
      description={extension?.description ?? "Configure and enable this extension."}
    >
      <Box>
        <CustomizableButton
          variant="text"
          color="primary"
          size="small"
          startIcon={<ChevronLeft size={14} />}
          onClick={() => navigate("/extensions")}
          sx={{ px: "8px" }}
        >
          Back to extensions
        </CustomizableButton>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" py="48px">
          <CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
        </Box>
      ) : error ? (
        <Box
          sx={{
            border: `1px solid ${theme.palette.status.error?.border ?? theme.palette.status.error?.main ?? palette.status.error.border}`,
            bgcolor: theme.palette.status.error?.bg ?? palette.accent.red.bg,
            borderRadius: radiusPx.sm,
            p: "12px 16px",
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              color: theme.palette.status.error?.text ?? palette.status.error.text,
            }}
          >
            {error}
          </Typography>
        </Box>
      ) : extension ? (
        <Stack spacing="20px">
          {/* Identity strip: icon · name (already in page header) · status pill · meta */}
          <Stack direction="row" alignItems="center" spacing="12px">
            {extension.iconPath && (
              <Box
                component="img"
                src={extension.iconPath}
                alt=""
                sx={{ width: 28, height: 28, objectFit: "contain", borderRadius: radiusPx.sm }}
              />
            )}
            <Box
              sx={{
                px: "8px",
                py: "2px",
                borderRadius: radiusPx.sm,
                bgcolor: statusStyles.bg,
                border: `1px solid ${statusStyles.border}`,
              }}
            >
              <Typography
                sx={{ fontSize: 11, fontWeight: 500, color: statusStyles.text, lineHeight: 1.5 }}
              >
                {statusStyles.label}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary }}>
              v{extension.version} · {humanizeCategory(extension.category)}
            </Typography>
          </Stack>

          {feedback && (
            <Box
              sx={{
                border: `1px solid ${
                  feedback.severity === "success"
                    ? (theme.palette.status.success.border ?? theme.palette.status.success.main)
                    : feedback.severity === "error"
                      ? (theme.palette.status.error?.border ?? theme.palette.status.error?.main)
                      : (theme.palette.status.info?.border ?? theme.palette.status.info?.main)
                }`,
                bgcolor:
                  feedback.severity === "success"
                    ? theme.palette.status.success.bg
                    : feedback.severity === "error"
                      ? (theme.palette.status.error?.bg ?? palette.accent.red.bg)
                      : (theme.palette.status.info?.bg ?? palette.status.info.bg),
                borderRadius: radiusPx.sm,
                p: "12px 16px",
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  color:
                    feedback.severity === "success"
                      ? theme.palette.status.success.text
                      : feedback.severity === "error"
                        ? (theme.palette.status.error?.text ?? palette.status.error.text)
                        : (theme.palette.status.info?.text ?? palette.status.info.text),
                }}
              >
                {feedback.message}
              </Typography>
            </Box>
          )}

          {/* Pre-enable configuration card — hidden when the extension has
              no pre-enable fields (e.g. slack, jira-assets, model-lifecycle,
              risk-import, dataset-bulk-upload). Post-enable setup for those
              extensions is done through their dedicated components below. */}
          {configFields.length > 0 && (
            <Box
              sx={{
                backgroundColor: theme.palette.background.main,
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: radiusPx.sm,
                p: "16px",
              }}
            >
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.palette.text.primary }}>
                Configuration
              </Typography>
              <ExtensionConfigForm
                key={formKey}
                fields={configFields}
                initialValues={extension.configuration}
                secretsSet={extension.secretsSet}
                disabled={busy !== null}
                onChange={handleFormChange}
              />
              {configFields.some((f) => f.isSecret) && (
                <Box sx={{ mt: "12px" }}>
                  <OptionalNotice />
                </Box>
              )}
            </Box>
          )}

          {extension.enabled && extension.key === "slack" && <SlackConfiguration />}
          {extension.enabled && extension.key === "model-lifecycle" && <ModelLifecycleConfig />}
          {extension.enabled && extension.key === "jira-assets" && <JiraAssetsConfiguration />}
          {extension.enabled && extension.key === "jira-incidents" && (
            <JiraIncidentsConfiguration />
          )}

          {/* Actions, with the connection test result right under them */}
          <Stack spacing="8px" data-testid="extension-actions">
            <Stack direction="row" spacing="12px" flexWrap="wrap" sx={{ rowGap: "8px" }}>
              {extension.enabled ? (
                <CustomizableButton
                  variant="outlined"
                  color="error"
                  size="medium"
                  onClick={() => setConfirmDisableOpen(true)}
                  isDisabled={busy !== null}
                >
                  Disable
                </CustomizableButton>
              ) : (
                <CustomizableButton
                  variant="contained"
                  color="primary"
                  size="medium"
                  onClick={handleEnable}
                  isDisabled={busy !== null}
                >
                  Enable
                </CustomizableButton>
              )}

              {extension.enabled && configFields.length > 0 && (
                <CustomizableButton
                  variant="outlined"
                  color="primary"
                  size="medium"
                  onClick={handleSaveConfig}
                  isDisabled={busy !== null}
                >
                  Save configuration
                </CustomizableButton>
              )}

              {configFields.length > 0 && (
                <CustomizableButton
                  variant="text"
                  color="primary"
                  size="medium"
                  onClick={handleTest}
                  isDisabled={busy !== null}
                >
                  Test connection
                </CustomizableButton>
              )}
            </Stack>

            {testResult && (
              <Typography
                role="status"
                sx={{
                  fontSize: 13,
                  color: testResult.success
                    ? theme.palette.status.success.text
                    : (theme.palette.status.error?.text ?? palette.status.error.text),
                }}
              >
                {testResult.message}
              </Typography>
            )}
          </Stack>

          <ConfirmDisableModal
            isOpen={confirmDisableOpen}
            extensionKey={extension.key}
            extensionName={extension.displayName}
            isSubmitting={busy === "disable"}
            onCancel={() => setConfirmDisableOpen(false)}
            onConfirm={handleDisable}
          />
        </Stack>
      ) : (
        <Box
          sx={{
            border: `1px solid ${theme.palette.status.warning?.border ?? palette.risk.medium.border}`,
            bgcolor: theme.palette.status.warning?.bg ?? palette.risk.medium.bg,
            borderRadius: radiusPx.sm,
            p: "12px 16px",
          }}
        >
          <Typography
            sx={{
              fontSize: 13,
              color: theme.palette.status.warning?.text ?? palette.risk.medium.text,
            }}
          >
            Extension not found.
          </Typography>
        </Box>
      )}
    </PageHeaderExtended>
  );
}
