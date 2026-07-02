import React, { useEffect, useState } from "react";
import { Box, Stack, Typography, Switch, FormControlLabel, CircularProgress } from "@mui/material";
import { useTheme } from "@mui/material";
import { Save as SaveIcon } from "lucide-react";
import Field from "../../../../components/Inputs/Field";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import Alert from "../../../../components/Alert";
import {
  getMonitoringConfig,
  updateMonitoringConfig,
} from "../../../../../application/repository/superAdmin.repository";

interface AlertState {
  variant: "success" | "info" | "warning" | "error";
  body: string;
}

/**
 * Monitoring / observability configuration for the whole deployment.
 *
 * Lets a super admin point this deployment's services at a central
 * Grafana/Prometheus/Loki stack (via an OpenTelemetry collector URL) and tag its
 * telemetry with a deployment name. Changes take effect after services restart.
 */
const Monitoring: React.FC = () => {
  const theme = useTheme();

  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [deploymentName, setDeploymentName] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [authHeaderSet, setAuthHeaderSet] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getMonitoringConfig();
        const cfg = res.data?.data;
        if (active && cfg) {
          setEnabled(Boolean(cfg.enabled));
          setUrl(cfg.otlp_endpoint || "");
          setDeploymentName(cfg.deployment_name || "");
          setAuthHeaderSet(Boolean(cfg.auth_header_set));
        }
      } catch {
        if (active) {
          setAlert({ variant: "error", body: "Failed to load monitoring configuration." });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const validate = (): boolean => {
    let ok = true;
    setUrlError(null);
    setNameError(null);
    if (enabled) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("protocol");
        }
      } catch {
        setUrlError("Enter a valid http(s) URL");
        ok = false;
      }
      if (!deploymentName.trim()) {
        setNameError("Deployment name is required when enabled");
        ok = false;
      }
    }
    return ok;
  };

  const handleSave = async () => {
    setAlert(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await updateMonitoringConfig({
        enabled,
        otlp_endpoint: url.trim(),
        deployment_name: deploymentName.trim(),
        // Send the secret only when entered; blank keeps the stored value.
        ...(authHeader.trim() ? { auth_header: authHeader.trim() } : {}),
      });
      const cfg = res.data?.data;
      if (cfg) {
        setAuthHeaderSet(Boolean(cfg.auth_header_set));
      }
      setAuthHeader("");
      setAlert({
        variant: "success",
        body: "Monitoring configuration saved. Restart services to apply changes.",
      });
    } catch {
      setAlert({ variant: "error", body: "Failed to save monitoring configuration." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Stack sx={{ pt: 4, maxWidth: 640 }} gap={theme.spacing(8)}>
      {alert && (
        <Box sx={{ mb: 2 }}>
          <Alert
            variant={alert.variant}
            body={alert.body}
            isToast={false}
            onClick={() => setAlert(null)}
          />
        </Box>
      )}

      <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
        Send logs and metrics from this deployment to a central observability stack (Grafana /
        Prometheus / Loki). Enter the OpenTelemetry collector URL of your monitoring VM and a
        deployment name to distinguish this server. Changes take effect after the services are
        restarted.
      </Typography>

      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            data-testid="monitoring-enabled-switch"
          />
        }
        label={
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
            Enable centralized monitoring
          </Typography>
        }
      />

      <Field
        id="monitoring-url"
        label="Observability URL"
        placeholder="https://obs.example.com:4318"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        error={urlError || undefined}
        disabled={!enabled}
        width="100%"
      />

      <Field
        id="monitoring-deployment-name"
        label="Deployment name"
        placeholder="acme-prod"
        value={deploymentName}
        onChange={(e) => setDeploymentName(e.target.value)}
        error={nameError || undefined}
        disabled={!enabled}
        width="100%"
      />

      <Field
        id="monitoring-auth-header"
        label="Auth header (optional)"
        placeholder={
          authHeaderSet ? "•••••••• (leave blank to keep)" : "Authorization: Bearer <token>"
        }
        value={authHeader}
        onChange={(e) => setAuthHeader(e.target.value)}
        disabled={!enabled}
        isOptional
        width="100%"
      />

      <Box>
        <CustomizableButton
          variant="contained"
          text={saving ? "Saving..." : "Save"}
          icon={<SaveIcon size={16} />}
          onClick={handleSave}
          isDisabled={saving}
        />
      </Box>
    </Stack>
  );
};

export default Monitoring;
