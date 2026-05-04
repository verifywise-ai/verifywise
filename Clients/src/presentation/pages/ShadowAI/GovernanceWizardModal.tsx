/**
 * Governance Wizard Modal
 *
 * Starts governance for a detected Shadow AI tool by creating
 * a model inventory entry and optionally assigning a risk entry.
 */

import { useState } from "react";
import { Stack, Typography, Box, Alert, SelectChangeEvent } from "@mui/material";
import { startGovernance } from "../../../application/repository/shadowAi.repository";
import { IShadowAiTool, ShadowAiGovernanceRequest } from "../../../domain/interfaces/i.shadowAi";
import StandardModal from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Toggle from "../../components/Inputs/Toggle";
import useUsers from "../../../application/hooks/useUsers";
import { palette } from "../../themes/palette";

interface GovernanceWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  tool: IShadowAiTool;
  onSuccess: () => void;
}

export default function GovernanceWizardModal({
  isOpen,
  onClose,
  tool,
  onSuccess,
}: GovernanceWizardModalProps) {
  const { users } = useUsers();
  const [provider, setProvider] = useState(tool.vendor || tool.name);
  const [model, setModel] = useState(tool.name);
  const [version, setVersion] = useState("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [dataSensitivity, setDataSensitivity] = useState("");
  const [riskDescription, setRiskDescription] = useState("");
  const [startLifecycle, setStartLifecycle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userItems = users.map((u) => ({
    _id: String(u.id),
    name: `${u.name} ${u.surname}`,
  }));

  const handleSubmit = async () => {
    if (!provider.trim() || !model.trim()) {
      setError("Provider and model name are required.");
      return;
    }
    if (!ownerId) {
      setError("Governance owner is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const request: ShadowAiGovernanceRequest = {
        model_inventory: {
          provider: provider.trim(),
          model: model.trim(),
          version: version.trim() || undefined,
          status: "active",
        },
        governance_owner_id: parseInt(ownerId, 10),
        risk_assessment:
          dataSensitivity.trim() || riskDescription.trim()
            ? {
                data_sensitivity: dataSensitivity.trim() || undefined,
                description: riskDescription.trim() || undefined,
              }
            : undefined,
        start_lifecycle: startLifecycle,
      };

      await startGovernance(tool.id, request);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start governance.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="Start governance"
      description={`Create a model inventory entry for "${tool.name}" and begin formal governance.`}
      submitButtonText="Start governance"
      onSubmit={handleSubmit}
      isSubmitting={submitting}
      maxWidth="520px"
    >
      <Stack gap="16px">
        {error && (
          <Alert severity="error" sx={{ fontSize: 13 }}>
            {error}
          </Alert>
        )}

        {/* Model inventory info */}
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary }}>
          Model inventory
        </Typography>
        <Stack direction="row" gap="16px">
          <Box sx={{ flex: 1 }}>
            <Field
              label="Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="e.g., OpenAI"
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Field
              label="Model name"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g., ChatGPT"
            />
          </Box>
        </Stack>
        <Field
          label="Version (optional)"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="e.g., 4.0"
        />

        {/* Governance owner */}
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mt: 1 }}>
          Governance owner
        </Typography>
        <Select
          id="governance-owner-select"
          label="Owner"
          value={ownerId}
          onChange={(e: SelectChangeEvent<string | number>) => setOwnerId(String(e.target.value))}
          items={userItems}
          placeholder="Select an owner"
        />

        {/* Risk assessment */}
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.secondary, mt: 1 }}>
          Risk assessment (optional)
        </Typography>
        <Select
          id="data-sensitivity-select"
          label="Data sensitivity"
          value={dataSensitivity}
          onChange={(e: SelectChangeEvent<string | number>) =>
            setDataSensitivity(String(e.target.value))
          }
          items={[
            { _id: "High", name: "High" },
            { _id: "Medium", name: "Medium" },
            { _id: "Low", name: "Low" },
          ]}
          placeholder="Select sensitivity level"
        />
        <Field
          label="Risk description"
          value={riskDescription}
          onChange={(e) => setRiskDescription(e.target.value)}
          placeholder="Brief risk description"
          type="description"
          rows={3}
        />

        {/* Lifecycle option */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
          <Stack>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Start lifecycle review</Typography>
            <Typography sx={{ fontSize: 11, color: palette.text.disabled }}>
              Automatically create a lifecycle entry for this model
            </Typography>
          </Stack>
          <Toggle
            checked={startLifecycle}
            onChange={(e) => setStartLifecycle(e.target.checked)}
            size="small"
          />
        </Stack>
      </Stack>
    </StandardModal>
  );
}
