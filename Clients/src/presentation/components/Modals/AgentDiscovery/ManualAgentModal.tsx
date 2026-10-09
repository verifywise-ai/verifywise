import React, { useState, useEffect, useMemo, useRef } from "react";
import { Drawer, Stack, Typography, Divider, IconButton } from "@mui/material";
import { X } from "lucide-react";
import Field from "../../Inputs/Field";
import SelectComponent from "../../Inputs/Select";
import MultiSelect from "../../Inputs/MultiSelect";
import { CustomizableButton } from "../../button/customizable-button";
import Alert from "../../Alert";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { getClientErrorReason } from "../../../../application/utils/apiErrorReason";
import { useUserNames } from "../../../pages/AgentDiscovery/useUserNames";
import { AgentPrimitiveRow } from "../../../../domain/interfaces/i.agentDiscovery";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import { palette } from "../../../themes/palette";

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

/** The agent's owners as user ids: the full set, else the legacy single owner_id. */
function getInitialOwnerIds(agent: AgentPrimitiveRow): number[] {
  if (agent.owner_ids && agent.owner_ids.length > 0) return agent.owner_ids;
  if (!agent.owner_id || !/^\d+$/.test(agent.owner_id)) return [];
  return [Number(agent.owner_id)];
}

const ManualAgentModal: React.FC<ManualAgentModalProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  agent,
}) => {
  const isEditMode = Boolean(agent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ownerIds, setOwnerIds] = useState<number[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  // True when owners who are no longer users of the organization were dropped
  // from the form on open; they would be removed on save, so say so.
  const [droppedUnknownOwners, setDroppedUnknownOwners] = useState(false);
  // Whether this opening's owners have been checked against the user list yet.
  const ownersCheckedRef = useRef(false);
  const { users: orgUsers, formatUser } = useUserNames();
  const users = useMemo(
    () => orgUsers.map((u) => ({ _id: u.id, name: formatUser(u.id) })),
    [orgUsers, formatUser],
  );
  const [formData, setFormData] = useState({
    display_name: "",
    primitive_type: "",
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
    [],
  );
  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<typeof formData>(validators);

  useEffect(() => {
    if (isOpen) {
      setSaveError(null);
      setDroppedUnknownOwners(false);
      ownersCheckedRef.current = false;
      if (agent) {
        setFormData({
          display_name: agent.display_name || "",
          primitive_type: agent.primitive_type || "",
          notes: agent.metadata?.notes || "",
        });
        setOwnerIds(getInitialOwnerIds(agent));
      }
    }
  }, [isOpen, agent]);

  // Owner ids that are not in the user list (e.g. deleted users) cannot be
  // shown in the owner picker, and the server drops them on save. Drop them
  // from the form once the users have loaded, so what is shown is what is
  // saved. An empty list means the users are not loaded (an organization
  // always has at least the current user), so wait rather than drop everyone.
  useEffect(() => {
    if (!isOpen || !agent || ownersCheckedRef.current || orgUsers.length === 0) return;
    ownersCheckedRef.current = true;
    const known = new Set(orgUsers.map((u) => Number(u.id)));
    if (getInitialOwnerIds(agent).every((id) => known.has(id))) return;
    setOwnerIds((current) => current.filter((id) => known.has(id)));
    setDroppedUnknownOwners(true);
  }, [isOpen, agent, orgUsers]);

  const handleClose = () => {
    setIsOpen(false);
    setFormData({ display_name: "", primitive_type: "", notes: "" });
    setOwnerIds([]);
    setSaveError(null);
    setDroppedUnknownOwners(false);
    resetErrors();
  };

  const handleSubmit = async () => {
    if (!validateAll(formData)) return;

    setIsSubmitting(true);
    setSaveError(null);
    try {
      const payload = {
        display_name: formData.display_name.trim(),
        primitive_type: formData.primitive_type,
        owner_ids: ownerIds,
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
      // Show the server's reason for a rejected save (e.g. an owner who is not
      // in the organization); anything else gets the generic retry message.
      setSaveError(getClientErrorReason(error) ?? "Could not save the agent. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={handleClose}
      PaperProps={{
        sx: { width: 440, backgroundColor: palette.background.modal },
      }}
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
        {saveError && (
          <Alert variant="error" body={saveError} hasIcon={false} sx={{ position: "static" }} />
        )}
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

        <MultiSelect
          id="owner_ids"
          label="Owners"
          placeholder="Select owners"
          value={ownerIds}
          items={users}
          onChange={(e) => setOwnerIds(e.target.value as number[])}
        />
        {droppedUnknownOwners && (
          <Typography
            fontSize={12}
            color={palette.text.secondary}
            data-testid="agent-dropped-owners-note"
            sx={{ mt: "-12px" }}
          >
            Owners who are no longer in your organization will be removed when you save.
          </Typography>
        )}

        <Field
          id="notes"
          label="Notes"
          type="description"
          rows={2}
          placeholder="Any additional context about this agent"
          value={formData.notes}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
        />
      </Stack>

      {/* Footer */}
      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: "16px 24px" }}>
        <CustomizableButton
          variant="outlined"
          sx={{ border: `1px solid ${palette.border.dark}` }}
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
            ? isEditMode
              ? "Saving..."
              : "Adding..."
            : isEditMode
              ? "Save changes"
              : "Add agent"}
        </CustomizableButton>
      </Stack>
    </Drawer>
  );
};

export default ManualAgentModal;
