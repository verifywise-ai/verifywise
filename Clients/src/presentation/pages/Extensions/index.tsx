import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Box, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import { CustomizableButton } from "../../components/button/customizable-button";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { useExtensions } from "../../../application/contexts/Extensions.context";
import { Extension } from "../../../domain/types/extensions";
import { useCan, usePermissionsSettled } from "../../../application/hooks/useCan";
import { radiusPx, status } from "../../themes/palette";
import ConfirmDisableModal from "./ConfirmDisableModal";
import { humanizeCategory } from "./catalogCopy";

// Where an enabled extension without a settings page appears, using the
// labels the sidebar and pages show: "AI risks" (sidebar) → "Add new risk"
// (RiskManagement) → "Import from Excel" (RiskImportMenuItem); "Datasets"
// (sidebar) → "Bulk upload" (BulkUploadButton); "Frameworks" (sidebar) →
// "Manage frameworks" → "Import framework from Excel" (Framework page menu).
const WHERE_IT_SHOWS_UP: Record<string, string> = {
  "risk-import": "AI risks → Add new risk → Import from Excel",
  "dataset-bulk-upload": "Datasets → Bulk upload",
  "framework-import": "Frameworks → Manage frameworks → Import framework from Excel",
};

const TOGGLE_FAILED_FALLBACK = "Could not change this extension. Try again.";

const errorMessageOf = (err: unknown): string => {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim() ? message : TOGGLE_FAILED_FALLBACK;
};

function ExtensionCard({
  extension,
  onToggle,
  onConfigure,
}: {
  extension: Extension;
  onToggle: (extension: Extension) => Promise<void>;
  onConfigure: (extension: Extension) => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  // The server's reason the last enable or disable failed, shown under the
  // buttons until the next attempt.
  const [toggleError, setToggleError] = useState<string | null>(null);
  const isEnabled = extension.enabled;
  // `requiresConfiguration` is a marker on the extension catalog, but some
  // extensions (e.g. model-lifecycle) mark themselves as needing configuration
  // for POST-enable setup — their pre-enable `configFields` array is empty.
  // Only steer the user to a config form when there's actually something to
  // fill in before enabling, otherwise the "Configure to enable" button lands
  // them on a page saying "This extension has no configuration."
  const hasPreEnableFields =
    extension.requiresConfiguration && (extension.configFields?.length ?? 0) > 0;
  // Extensions that own a dedicated post-enable settings UI. Adding a new
  // extension with its own settings component means adding it here so the
  // "Configure" button appears once enabled.
  const KEYS_WITH_POST_ENABLE_UI = new Set([
    "slack",
    "model-lifecycle",
    "jira-assets",
    "jira-incidents",
  ]);
  const hasPostEnableSurface =
    (extension.configFields?.length ?? 0) > 0 || KEYS_WITH_POST_ENABLE_UI.has(extension.key);
  // Show the primary button only when there is something for it to do:
  // enable (with or without a pre-enable form) or open a settings surface
  // that actually exists. Extensions with no config surface at all (e.g.
  // risk-import, dataset-bulk-upload) get just "Disable" once enabled — no
  // "Configure" that leads to an empty page.
  const showPrimary = !isEnabled || hasPostEnableSurface;
  const primaryLabel = isEnabled
    ? "Configure"
    : hasPreEnableFields
      ? "Configure to enable"
      : "Enable";
  const whereItShowsUp = !hasPostEnableSurface ? WHERE_IT_SHOWS_UP[extension.key] : undefined;

  const runToggle = async () => {
    setBusy(true);
    setToggleError(null);
    try {
      await onToggle(extension);
    } catch (err) {
      setToggleError(errorMessageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const primaryOnClick = () => {
    if (isEnabled || hasPreEnableFields) {
      onConfigure(extension);
      return;
    }
    void runToggle();
  };

  const confirmDisable = async () => {
    await runToggle();
    setConfirmDisableOpen(false);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: theme.palette.background.main,
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: radiusPx.sm,
        p: "16px",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap="8px">
        <Stack direction="row" spacing="3px" alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
          {extension.iconPath && (
            <Box
              component="img"
              src={extension.iconPath}
              alt=""
              sx={{
                width: 24,
                height: 24,
                objectFit: "contain",
                borderRadius: radiusPx.sm,
                flexShrink: 0,
              }}
            />
          )}
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 600,
              color: theme.palette.text.primary,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {extension.displayName}
          </Typography>
        </Stack>
        <Box
          sx={{
            px: "8px",
            py: "2px",
            borderRadius: radiusPx.sm,
            backgroundColor: isEnabled ? theme.palette.status.success.bg : status.default.bg,
            border: `1px solid ${
              isEnabled
                ? (theme.palette.status.success.border ?? theme.palette.status.success.main)
                : status.default.border
            }`,
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: isEnabled ? theme.palette.status.success.text : status.default.text,
              lineHeight: 1.5,
            }}
          >
            {isEnabled ? "Enabled" : "Disabled"}
          </Typography>
        </Box>
      </Stack>

      <Typography
        sx={{
          mt: "8px",
          fontSize: 12,
          color: theme.palette.text.tertiary,
        }}
      >
        {humanizeCategory(extension.category)} · v{extension.version}
        {hasPreEnableFields && !isEnabled && (
          <>
            {" · "}
            <span>Configuration required</span>
          </>
        )}
      </Typography>

      <Typography
        sx={{
          mt: "8px",
          fontSize: 13,
          color: theme.palette.text.secondary,
          flex: 1,
        }}
      >
        {extension.description}
      </Typography>

      {isEnabled && whereItShowsUp && (
        <Stack sx={{ mt: "8px" }} spacing="2px">
          <Typography sx={{ fontSize: 12, fontWeight: 500, color: theme.palette.text.secondary }}>
            Where it shows up
          </Typography>
          <Typography sx={{ fontSize: 12, color: theme.palette.text.tertiary }}>
            {whereItShowsUp}
          </Typography>
        </Stack>
      )}

      <Stack direction="row" spacing="2px" sx={{ mt: "16px" }}>
        {showPrimary && (
          <CustomizableButton
            variant={isEnabled ? "outlined" : "contained"}
            color="primary"
            size="small"
            onClick={primaryOnClick}
            isDisabled={busy}
          >
            {primaryLabel}
          </CustomizableButton>
        )}
        {isEnabled && (
          <CustomizableButton
            variant="text"
            color="error"
            size="small"
            isDisabled={busy}
            onClick={() => {
              setToggleError(null);
              setConfirmDisableOpen(true);
            }}
          >
            Disable
          </CustomizableButton>
        )}
      </Stack>

      {toggleError && (
        <Typography
          role="alert"
          sx={{
            mt: "8px",
            fontSize: 12,
            color: theme.palette.status.error?.text ?? status.error.text,
          }}
        >
          {toggleError}
        </Typography>
      )}

      <ConfirmDisableModal
        isOpen={confirmDisableOpen}
        extensionKey={extension.key}
        extensionName={extension.displayName}
        isSubmitting={busy}
        onCancel={() => setConfirmDisableOpen(false)}
        onConfirm={confirmDisable}
      />
    </Box>
  );
}

export default function ExtensionsPage() {
  const theme = useTheme();
  const { extensions, loading, error, refetch, enable, disable } = useExtensions();
  const canManageExtensions = useCan("extension.admin");
  const settled = usePermissionsSettled();
  const navigate = useNavigate();

  if (!settled) return null;
  if (!canManageExtensions) {
    return <Navigate to="/" replace />;
  }

  // The card shows a failed toggle inline, so the global error toast would
  // repeat it.
  const toggle = async (ext: Extension) => {
    const quiet = { suppressGlobalErrorToast: true };
    if (ext.enabled) {
      await disable(ext.key, quiet);
    } else {
      await enable(ext.key, undefined, quiet);
    }
  };

  const configure = (ext: Extension) => {
    navigate(`/extensions/${ext.key}/settings`);
  };

  return (
    <PageHeaderExtended
      title="Extensions"
      description="Enable and configure integrations for your organization."
      helpArticlePath="integrations/extensions"
    >
      {loading ? (
        <Box display="flex" justifyContent="center" py="12px">
          <CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
        </Box>
      ) : error ? (
        <Stack spacing="12px" alignItems="flex-start">
          <Typography
            role="alert"
            sx={{ fontSize: 13, color: theme.palette.status.error?.text ?? status.error.text }}
          >
            {error}
          </Typography>
          <CustomizableButton variant="outlined" onClick={() => void refetch()}>
            Try again
          </CustomizableButton>
        </Stack>
      ) : (
        <Box
          display="grid"
          gridTemplateColumns={{
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            lg: "repeat(3, 1fr)",
          }}
          gap="16px"
        >
          {extensions.map((ext) => (
            <ExtensionCard
              key={ext.key}
              extension={ext}
              onToggle={toggle}
              onConfigure={configure}
            />
          ))}
        </Box>
      )}
    </PageHeaderExtended>
  );
}
