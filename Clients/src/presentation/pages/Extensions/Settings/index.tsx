import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Box, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import { ChevronLeft } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useExtensions } from "../../../../application/contexts/Extensions.context";
import {
  ExtensionConfigForm,
  ExtensionConfigFormValues,
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

const CATEGORY_LABEL: Record<string, string> = {
  communication: "Communication",
  ml_ops: "ML Ops",
  data_management: "Data management",
  version_control: "Version control",
  monitoring: "Monitoring",
  security: "Security",
  analytics: "Analytics",
};
const humanizeCategory = (raw: string): string =>
  CATEGORY_LABEL[raw] ?? raw.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Per-extension settings page — /extensions/:key/settings.
 * Config form + Enable/Disable + optional Test Connection.
 *
 * The initial fetch uses `getExtensionByKey` (fresh from the server so we
 * see the latest `configuration` shape). Enable/disable/updateConfiguration
 * go through the Extensions context so the list-page cache stays fresh.
 */
export default function ExtensionSettingsPage() {
  const theme = useTheme();
  const { key } = useParams();
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  const { enable, disable, updateConfiguration, getByKey } = useExtensions();

  const [extension, setExtension] = useState<Extension | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ExtensionConfigFormValues>({});
  const [busy, setBusy] = useState<"enable" | "disable" | "save" | "test" | null>(null);
  const [feedback, setFeedback] = useState<{
    severity: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const ext = await getExtensionByKey({ key });
      setExtension(ext);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load extension");
    } finally {
      setLoading(false);
    }
  }, [key]);

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
      setFeedback({ severity: "success", message: `${extension.displayName} enabled.` });
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
      setExtension(next);
      setFeedback({ severity: "success", message: `${extension.displayName} disabled.` });
    } catch (err: any) {
      setFeedback({
        severity: "error",
        message: err?.response?.data?.data?.message ?? err?.message ?? "Disable failed",
      });
    } finally {
      setBusy(null);
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
    setFeedback(null);
    try {
      const submit = prepareSubmitValues(configFields, formValues);
      const result = await testExtensionConnection({ key: extension.key, configuration: submit });
      setFeedback({
        severity: result.success ? "success" : "error",
        message: result.message,
      });
    } catch (err: any) {
      setFeedback({
        severity: "error",
        message: err?.response?.data?.data?.message ?? err?.message ?? "Test failed",
      });
    } finally {
      setBusy(null);
    }
  };

  if (userRoleName !== "Admin") {
    return <Navigate to="/" replace />;
  }

  const statusStyles = extension?.enabled
    ? {
        bg: theme.palette.status.success.bg,
        border: theme.palette.status.success.border ?? theme.palette.status.success.main,
        text: theme.palette.status.success.text,
        label: "Enabled",
      }
    : null;

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
            border: `1px solid ${theme.palette.status.error?.border ?? theme.palette.status.error?.main ?? "#F5B8B8"}`,
            bgcolor: theme.palette.status.error?.bg ?? "#FFF1F1",
            borderRadius: "4px",
            p: "12px 16px",
          }}
        >
          <Typography sx={{ fontSize: 13, color: theme.palette.status.error?.text ?? "#B42318" }}>
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
                sx={{ width: 28, height: 28, objectFit: "contain", borderRadius: "4px" }}
              />
            )}
            {statusStyles && (
              <Box
                sx={{
                  px: "8px",
                  py: "2px",
                  borderRadius: "4px",
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
            )}
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
                      ? (theme.palette.status.error?.bg ?? "#FFF1F1")
                      : (theme.palette.status.info?.bg ?? "#EFF6FF"),
                borderRadius: "4px",
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
                        ? (theme.palette.status.error?.text ?? "#B42318")
                        : (theme.palette.status.info?.text ?? "#1D4ED8"),
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
                borderRadius: "4px",
                p: "16px",
              }}
            >
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.palette.text.primary }}>
                Configuration
              </Typography>
              <ExtensionConfigForm
                fields={configFields}
                initialValues={extension.configuration}
                disabled={busy !== null}
                onChange={setFormValues}
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

          {/* Actions */}
          <Stack direction="row" spacing="12px" flexWrap="wrap" sx={{ rowGap: "8px" }}>
            {extension.enabled ? (
              <CustomizableButton
                variant="outlined"
                color="error"
                size="medium"
                onClick={handleDisable}
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

            {extension.enabled && extension.requiresConfiguration && (
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
        </Stack>
      ) : (
        <Box
          sx={{
            border: `1px solid ${theme.palette.status.warning?.border ?? "#F5E6B8"}`,
            bgcolor: theme.palette.status.warning?.bg ?? "#FFF8E1",
            borderRadius: "4px",
            p: "12px 16px",
          }}
        >
          <Typography sx={{ fontSize: 13, color: theme.palette.status.warning?.text ?? "#795548" }}>
            Extension not found.
          </Typography>
        </Box>
      )}
    </PageHeaderExtended>
  );
}
