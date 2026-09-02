import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Box, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import { CustomizableButton } from "../../components/button/customizable-button";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { useExtensions } from "../../../application/contexts/Extensions.context";
import { useAuth } from "../../../application/hooks/useAuth";
import { Extension } from "../../../domain/types/extensions";

// Map backend enum snake_case to display strings. `category` mirrors the DB
// CHECK constraint on verifywise.extensions.category.
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
  const KEYS_WITH_POST_ENABLE_UI = new Set(["slack", "model-lifecycle", "jira-assets"]);
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
  const primaryOnClick = () => {
    if (isEnabled || hasPreEnableFields) {
      onConfigure(extension);
      return;
    }
    setBusy(true);
    onToggle(extension).finally(() => setBusy(false));
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: theme.palette.background.main,
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: "4px",
        p: "16px",
      }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: "center",
            minWidth: 0,
            flex: 1,
          }}
        >
          {extension.iconPath && (
            <Box
              component="img"
              src={extension.iconPath}
              alt=""
              sx={{
                width: 24,
                height: 24,
                objectFit: "contain",
                borderRadius: "4px",
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
        {isEnabled && (
          <Box
            sx={{
              px: "8px",
              py: "2px",
              borderRadius: "4px",
              backgroundColor: theme.palette.status.success.bg,
              border: `1px solid ${theme.palette.status.success.border ?? theme.palette.status.success.main}`,
              flexShrink: 0,
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 500,
                color: theme.palette.status.success.text,
                lineHeight: 1.5,
              }}
            >
              Enabled
            </Typography>
          </Box>
        )}
      </Stack>

      <Typography
        sx={{
          mt: "8px",
          fontSize: 12,
          color: theme.palette.text.tertiary,
        }}
      >
        {humanizeCategory(extension.category)} · v{extension.version}
        {hasPreEnableFields && !isEnabled && " · Configuration required"}
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

      <Stack direction="row" spacing={1} sx={{ mt: "16px" }}>
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
              setBusy(true);
              onToggle(extension).finally(() => setBusy(false));
            }}
          >
            Disable
          </CustomizableButton>
        )}
      </Stack>
    </Box>
  );
}

export default function ExtensionsPage() {
  const theme = useTheme();
  const { extensions, loading, error, enable, disable } = useExtensions();
  const { userRoleName } = useAuth();
  const navigate = useNavigate();

  if (userRoleName !== "Admin") {
    return <Navigate to="/" replace />;
  }

  const toggle = async (ext: Extension) => {
    if (ext.enabled) {
      await disable(ext.key);
    } else {
      await enable(ext.key);
    }
  };

  const configure = (ext: Extension) => {
    navigate(`/extensions/${ext.key}/settings`);
  };

  return (
    <PageHeaderExtended
      title="Extensions"
      description="Enable and configure integrations for your organization."
    >
      {loading ? (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            py: 6,
          }}
        >
          <CircularProgress size={24} sx={{ color: theme.palette.primary.main }} />
        </Box>
      ) : error ? (
        <Typography sx={{ fontSize: 13, color: theme.palette.status.error?.text ?? "error.main" }}>
          {error}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",

            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              lg: "repeat(3, 1fr)",
            },

            gap: "16px",
          }}
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
