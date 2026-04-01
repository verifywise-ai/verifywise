import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Drawer,
  Stack,
  Typography,
  Divider,
  IconButton,
  useTheme,
} from "@mui/material";
import { X } from "lucide-react";
import Field from "../../Inputs/Field";
import SelectComponent from "../../Inputs/Select";
import { CustomizableButton } from "../../button/customizable-button";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { AgentPrimitiveRow } from "../../../../domain/interfaces/i.agentDiscovery";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { checkStringValidation } from "../../../../application/validations/stringValidation";

interface ManualAgentModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
  agent?: AgentPrimitiveRow | null;
}

const PRIMITIVE_TYPES = [
  { _id: "agent", name: "Agent" },
  { _id: "assistant", name: "Assistant" },
  { _id: "bot", name: "Bot" },
  { _id: "copilot", name: "Copilot" },
  { _id: "workflow", name: "Workflow" },
  { _id: "function", name: "Function" },
  { _id: "other", name: "Other" },
];

const ManualAgentModal: React.FC<ManualAgentModalProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  agent,
}) => {
  const theme = useTheme();
  const isEditMode = Boolean(agent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState<{ _id: string; name: string }[]>([]);
  const [formData, setFormData] = useState({
    display_name: "",
    primitive_type: "",
    owner_id: "",
    notes: "",
  });

  const validators = useMemo(
    () => ({
      display_name: (v: unknown) => {
        const r = checkStringValidation("Display name", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      primitive_type: (v: unknown) => (!v ? "Type is required." : ""),
    }),
    []
  );
  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<typeof formData>(validators);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      const usersData = Array.isArray(response?.data) ? response.data : [];
      setUsers(
        usersData.map((u: { id: number; name: string; surname: string }) => ({
          _id: String(u.id),
          name: `${u.name} ${u.surname}`.trim(),
        }))
      );
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      if (agent) {
        setFormData({
          display_name: agent.display_name || "",
          primitive_type: agent.primitive_type || "",
          owner_id: agent.owner_id || "",
          notes: agent.metadata?.notes || "",
        });
      }
    }
  }, [isOpen, fetchUsers, agent]);

  const handleClose = () => {
    setIsOpen(false);
    setFormData({ display_name: "", primitive_type: "", owner_id: "", notes: "" });
    resetErrors();
  };

  const handleSubmit = async () => {
    if (!validateAll(formData)) return;

    setIsSubmitting(true);
    try {
      const payload = {
        display_name: formData.display_name.trim(),
        primitive_type: formData.primitive_type,
        owner_id: formData.owner_id.trim() || undefined,
        metadata: formData.notes.trim() ? { notes: formData.notes.trim() } : {},
      };

      if (isEditMode && agent) {
        await apiServices.patch(`/agent-primitives/${agent.id}`, payload);
      } else {
        await apiServices.post("/agent-primitives", payload);
      }
      handleClose();
      onSuccess();
    } catch (error) {
      console.error(`Failed to ${isEditMode ? "update" : "create"} agent:`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={handleClose}
      PaperProps={{ sx: { width: 440, backgroundColor: theme.palette.background.modal || "#FCFCFD" } }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ p: "16px 24px" }}
      >
        <Typography fontSize={16} fontWeight={600}>
          {isEditMode ? "Edit agent" : "Add agent manually"}
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <X size={20} />
        </IconButton>
      </Stack>

      <Divider />

      {/* Form content */}
      <Stack sx={{ p: "24px", gap: "20px", flex: 1, overflow: "auto" }}>
        <Field
          id="display_name"
          label="Display name"
          placeholder="e.g. Sales Assistant Bot"
          value={formData.display_name}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, display_name: e.target.value }));
            clearFieldError("display_name");
          }}
          isRequired
          error={errors.display_name}
        />

        <SelectComponent
          id="primitive_type"
          label="Type"
          placeholder="Select type"
          value={formData.primitive_type}
          items={PRIMITIVE_TYPES}
          isRequired
          error={errors.primitive_type}
          onChange={(e) => {
            setFormData((prev) => ({
              ...prev,
              primitive_type: e.target.value as string,
            }));
            clearFieldError("primitive_type");
          }}
        />

        <SelectComponent
          id="owner_id"
          label="Owner"
          placeholder="Select owner"
          value={formData.owner_id}
          items={users}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              owner_id: e.target.value as string,
            }))
          }
        />

        <Field
          id="notes"
          label="Notes"
          type="description"
          rows={2}
          placeholder="Any additional context about this agent"
          value={formData.notes}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, notes: e.target.value }))
          }
        />
      </Stack>

      {/* Footer */}
      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: "16px 24px" }}>
        <CustomizableButton
          variant="outlined"
          sx={{ border: "1px solid #d0d5dd" }}
          onClick={handleClose}
        >
          Cancel
        </CustomizableButton>
        <CustomizableButton
          variant="contained"
          sx={{ backgroundColor: "brand.primary", border: "1px solid brand.primary" }}
          onClick={handleSubmit}
          isDisabled={isSubmitting}
        >
          {isSubmitting
            ? isEditMode ? "Saving..." : "Adding..."
            : isEditMode ? "Save changes" : "Add agent"}
        </CustomizableButton>
      </Stack>
    </Drawer>
  );
};

export default ManualAgentModal;
