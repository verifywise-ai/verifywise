import React, { useCallback, useEffect, useState } from "react";
import { Box, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import Field from "../../../components/Inputs/Field";
import Alert from "../../../components/Alert";
import { Button } from "../../../components/button";
import Select from "../../../components/Inputs/Select";
import { useAuth } from "../../../../application/hooks/useAuth";
import {
  GetSsoConfig,
  ToggleSsoStatus,
  UpdateSsoConfig,
} from "../../../../application/repository/ssoConfig.repository";

interface SsoConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  cloudEnvironment: "AzurePublic" | "AzureGovernment";
  isEnabled: boolean;
}

interface ValidationErrors {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

const cloudEnvironments = [
  { _id: "AzurePublic", name: "Azure Public Cloud" },
  { _id: "AzureGovernment", name: "Azure Government" },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SsoConfigTab: React.FC = () => {
  const { organizationId } = useAuth();
  const theme = useTheme();

  const [config, setConfig] = useState<SsoConfig>({
    tenantId: "",
    clientId: "",
    clientSecret: "",
    cloudEnvironment: "AzurePublic",
    isEnabled: false,
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [hasSavedConfig, setHasSavedConfig] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!organizationId) {
        setIsLoading(false);
        return;
      }
      try {
        const response = await GetSsoConfig({ routeUrl: `ssoConfig?provider=AzureAD` });
        const data = (response?.data as any)?.data;
        if (data) {
          setConfig({
            tenantId: data.config_data?.tenant_id || "",
            clientId: data.config_data?.client_id || "",
            clientSecret: "",
            cloudEnvironment: data.config_data?.cloud_environment || "AzurePublic",
            isEnabled: !!data.is_enabled,
          });
          setHasSavedConfig(true);
        }
      } catch {
        // empty form on error
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [organizationId]);

  const validateField = useCallback(
    (field: keyof ValidationErrors, value: string) => {
      const next = { ...errors };
      switch (field) {
        case "tenantId":
          next.tenantId = !value
            ? "Tenant ID is required"
            : !UUID_REGEX.test(value)
              ? "Please enter a valid UUID format"
              : undefined;
          break;
        case "clientId":
          next.clientId = !value
            ? "Client ID is required"
            : !UUID_REGEX.test(value)
              ? "Please enter a valid UUID format"
              : undefined;
          break;
        case "clientSecret":
          next.clientSecret = !value
            ? "Client Secret is required"
            : value.length < 10
              ? "Client Secret must be at least 10 characters"
              : undefined;
          break;
      }
      Object.keys(next).forEach((k) => {
        if (!next[k as keyof ValidationErrors]) delete next[k as keyof ValidationErrors];
      });
      setErrors(next);
    },
    [errors],
  );

  const handleFieldChange =
    (field: keyof SsoConfig) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setConfig((prev) => ({ ...prev, [field]: value }));
      if (field === "tenantId" || field === "clientId" || field === "clientSecret") {
        validateField(field, value);
      }
    };

  const handleSelectChange = (field: keyof SsoConfig) => (event: any) => {
    setConfig((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSave = async () => {
    validateField("tenantId", config.tenantId);
    validateField("clientId", config.clientId);
    validateField("clientSecret", config.clientSecret);
    if (
      !config.tenantId ||
      !config.clientId ||
      !config.clientSecret ||
      Object.keys(errors).length > 0
    ) {
      return;
    }
    setIsSaving(true);
    try {
      await UpdateSsoConfig({
        routeUrl: `ssoConfig?provider=AzureAD`,
        body: {
          client_id: config.clientId,
          client_secret: config.clientSecret,
          tenant_id: config.tenantId,
          cloud_environment: config.cloudEnvironment,
        },
      });
      setConfig((prev) => ({ ...prev, clientSecret: "" }));
      setHasSavedConfig(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async () => {
    setIsEnabling(true);
    try {
      const endpoint = config.isEnabled ? "disable" : "enable";
      await ToggleSsoStatus({
        routeUrl: `ssoConfig/${endpoint}?provider=AzureAD`,
        body: {},
      });
      setConfig((prev) => ({ ...prev, isEnabled: !prev.isEnabled }));
    } finally {
      setIsEnabling(false);
    }
  };

  const cardStyles = {
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    border: `1.5px solid ${theme.palette.divider}`,
    padding: theme.spacing(5, 6),
    boxShadow: "none",
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  const hasAllFields = !!config.tenantId && !!config.clientId && !!config.clientSecret;
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Box>
      <Box sx={{ height: "16px" }} />
      <Alert
        variant="info"
        body={`Need help finding these values? Visit Azure Portal → Microsoft Entra ID → App registrations → [Your App]. Under Authentication → Redirect URIs, register exactly this URL: ${window.location.origin}/auth/microsoft/callback`}
        sx={{ position: "static" }}
        isToast={false}
      />
      <Box sx={{ height: "16px" }} />

      <Box sx={cardStyles}>
        <Typography fontSize={15} fontWeight={700} gutterBottom>
          Entra ID SSO configuration
        </Typography>

        <Stack spacing={0}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={3}
            sx={{ marginBottom: theme.spacing(10) }}
          >
            <Box sx={{ flex: 1 }}>
              <Field
                label="Tenant id"
                placeholder="Enter your Azure AD Tenant ID"
                value={config.tenantId}
                onChange={handleFieldChange("tenantId")}
                error={errors.tenantId}
                isRequired
                sx={{ width: "100%" }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: "12px" }}>
                Found in Azure Portal &gt; Microsoft Entra ID &gt; Overview &gt; Tenant ID
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Field
                label="Client id"
                placeholder="Enter your Application (client) ID"
                value={config.clientId}
                onChange={handleFieldChange("clientId")}
                error={errors.clientId}
                isRequired
                sx={{ width: "100%" }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: "12px" }}>
                Found in Azure Portal &gt; App registrations &gt; [Your App] &gt; Application
                (client) ID
              </Typography>
            </Box>
          </Stack>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={3}
            sx={{ marginBottom: theme.spacing(10) }}
          >
            <Box sx={{ flex: 1 }}>
              <Field
                label="Client secret"
                type="password"
                placeholder="Enter your client secret"
                value={config.clientSecret}
                onChange={handleFieldChange("clientSecret")}
                error={errors.clientSecret}
                isRequired
                sx={{ width: "100%" }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Select
                id="cloud-environment"
                label="Cloud environment"
                value={config.cloudEnvironment}
                items={cloudEnvironments}
                onChange={handleSelectChange("cloudEnvironment")}
                getOptionValue={(option) => option._id}
                sx={{ width: "100%" }}
              />
            </Box>
          </Stack>
        </Stack>

        <Stack direction="row" justifyContent="flex-end" spacing={2}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={isSaving || !hasAllFields || hasErrors}
            sx={{ height: "34px", fontSize: 13, fontWeight: 400, textTransform: "none" }}
          >
            {isSaving ? "Saving..." : "Save configuration"}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ height: "16px" }} />

      <Box sx={cardStyles}>
        <Typography fontSize={15} fontWeight={700} gutterBottom>
          Enable Entra ID SSO
        </Typography>
        <Box sx={{ marginBottom: theme.spacing(3) }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: "13px" }}>
            Enable SSO authentication for this organization. Configuration must be saved before
            enabling.
          </Typography>
        </Box>
        <Stack direction="row" justifyContent="flex-end">
          <Button
            variant={config.isEnabled ? "outlined" : "contained"}
            onClick={handleToggle}
            disabled={isEnabling || !hasSavedConfig}
            sx={{ height: "34px", fontSize: 13, fontWeight: 400, textTransform: "none" }}
          >
            {isEnabling ? "Processing..." : config.isEnabled ? "Disable SSO" : "Enable SSO"}
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default SsoConfigTab;
