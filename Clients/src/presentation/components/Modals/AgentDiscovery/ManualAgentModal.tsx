import React, { useState, useEffect, useMemo, useRef } from "react";
import { Drawer, Stack, Typography, Divider, IconButton } from "@mui/material";
import { X } from "lucide-react";
import Field from "../../Inputs/Field";
import SelectComponent from "../../Inputs/Select";
import AutoCompleteField from "../../Inputs/Autocomplete";
import { CustomizableButton } from "../../button/customizable-button";
import Alert from "../../Alert";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { getClientErrorReason } from "../../../../application/utils/apiErrorReason";
import { useUserNames } from "../../../pages/AgentDiscovery/useUserNames";
import {
  formatModelLabel,
  formatUseCaseLabel,
  getAgentOwnerIds,
  isUserIdLike,
} from "../../../pages/AgentDiscovery/agentLabels";
import { useProjects } from "../../../../application/hooks/useProjects";
import { useModelInventories } from "../../../../application/hooks/useModelInventories";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
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

/** One choice in the owner, model and use case pickers. */
interface PickerOption {
  id: number;
  name: string;
}

/** The selected value in a single picker, at the same size as the other fields. */
const singlePickerSx = { "& .MuiAutocomplete-input": { fontSize: "13px" } };

/** Longest description the server accepts. */
const MAX_DESCRIPTION_LENGTH = 5000;

/** The agent's owners that are user ids (everything but legacy text). */
function getOwnerUserIds(agent: AgentPrimitiveRow): number[] {
  return getAgentOwnerIds(agent).filter(isUserIdLike).map(Number);
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
  // Owners are sent on an edit only when the owner selection was changed, so
  // editing the name or notes never touches the owners.
  const [ownersChanged, setOwnersChanged] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // True once the users list has been refetched for this opening of the form.
  const [usersRefreshed, setUsersRefreshed] = useState(false);
  // Owner ids still missing from the refreshed users list (e.g. deleted
  // users). They cannot be shown in the picker, and are dropped only if the
  // owner selection is changed and saved, so say so.
  const [unknownOwnerIds, setUnknownOwnerIds] = useState<number[]>([]);
  // Whether this opening's owners have been checked against the user list yet.
  const ownersCheckedRef = useRef(false);
  const { users: orgUsers, formatUser, refreshUsers } = useUserNames();
  const { t } = useTranslation();
  // A free-text owner from the old single-owner API (not a VerifyWise user).
  // It is shown read-only; choosing owners replaces it.
  const legacyTextOwner = useMemo(
    () => (agent ? (getAgentOwnerIds(agent).find((v) => !isUserIdLike(v)) ?? null) : null),
    [agent],
  );
  const users = useMemo<PickerOption[]>(
    () => orgUsers.map((u) => ({ id: Number(u.id), name: formatUser(u.id) })),
    [orgUsers, formatUser],
  );
  // The picker shows the selected owners in their saved order, primary first.
  const selectedOwners = useMemo(
    () =>
      ownerIds
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is PickerOption => u !== undefined),
    [ownerIds, users],
  );
  const [formData, setFormData] = useState({
    display_name: "",
    primitive_type: "",
    description: "",
    notes: "",
  });
  // Optional links. Like the owners, an edit sends each only when it changed.
  const [linkedModelId, setLinkedModelId] = useState<number | null>(null);
  const [linkedProjectId, setLinkedProjectId] = useState<number | null>(null);
  // Both lists are cached and fetched only while the drawer is open.
  const { approvedProjects } = useProjects({ enabled: isOpen });
  const { data: inventory, isError: modelsFailed } = useModelInventories({ enabled: isOpen });
  const models = useMemo<PickerOption[]>(
    () =>
      (inventory ?? [])
        .filter((m): m is typeof m & { id: number } => m.id != null)
        .map((m) => ({ id: Number(m.id), name: formatModelLabel(m) })),
    [inventory],
  );
  const useCases = useMemo<PickerOption[]>(() => {
    const options = approvedProjects
      .filter((p) => !p.is_organizational)
      .map((p) => ({ id: Number(p.id), name: p.project_title }));
    // Keep the current link selectable even when it is not in the list (e.g. a
    // use case awaiting approval), so opening the form never drops it.
    const current = agent?.linked_project_id;
    if (agent && current && !options.some((o) => o.id === current)) {
      options.push({ id: current, name: formatUseCaseLabel(agent) });
    }
    return options;
  }, [approvedProjects, agent]);
  const modelOptions = useMemo<PickerOption[]>(() => {
    const current = agent?.linked_model_inventory_id;
    if (current && !models.some((m) => m.id === current)) {
      return [...models, { id: current, name: `Model #${current}` }];
    }
    return models;
  }, [models, agent]);

  const validators = useMemo(
    () => ({
      display_name: (v: unknown) => {
        const r = checkStringValidation("Display name", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      primitive_type: (v: unknown) => (!v ? "Type is required." : ""),
      description: (v: unknown) =>
        ((v as string) ?? "").trim().length > MAX_DESCRIPTION_LENGTH
          ? fill(t("Description must be at most {max} characters."), {
              max: MAX_DESCRIPTION_LENGTH,
            })
          : "",
    }),
    [t],
  );
  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<typeof formData>(validators);

  useEffect(() => {
    if (!isOpen) return;
    setSaveError(null);
    setOwnersChanged(false);
    setUnknownOwnerIds([]);
    setUsersRefreshed(false);
    ownersCheckedRef.current = false;
    if (agent) {
      setFormData({
        display_name: agent.display_name || "",
        primitive_type: agent.primitive_type || "",
        description: agent.description || "",
        notes: agent.metadata?.notes || "",
      });
      setOwnerIds(getOwnerUserIds(agent));
      setLinkedModelId(agent.linked_model_inventory_id ?? null);
      setLinkedProjectId(agent.linked_project_id ?? null);
    }
    // Only an edit with owners needs fresh users: refetch them, so an owner who
    // was added since the list was cached is not mistaken for an unknown one.
    // A new agent (or one without owners) uses the cached list.
    if (!agent || getOwnerUserIds(agent).length === 0) {
      setUsersRefreshed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await refreshUsers();
      } catch {
        // Keep the cached list; the check below still runs on it.
      } finally {
        if (!cancelled) setUsersRefreshed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, agent, refreshUsers]);

  // Once the refreshed users have loaded, find owner ids that are still not
  // users. They are left out of the picker (it cannot show them), and only
  // reach the saved owners if the selection is not changed. An empty list
  // means the users are not loaded (an organization always has at least the
  // current user), so wait rather than call everyone unknown.
  useEffect(() => {
    if (!isOpen || !agent || !usersRefreshed || ownersCheckedRef.current) return;
    if (orgUsers.length === 0) return;
    ownersCheckedRef.current = true;
    const known = new Set(orgUsers.map((u) => Number(u.id)));
    const unknown = getOwnerUserIds(agent).filter((id) => !known.has(id));
    if (unknown.length === 0) return;
    setUnknownOwnerIds(unknown);
    setOwnerIds((current) => current.filter((id) => known.has(id)));
  }, [isOpen, agent, usersRefreshed, orgUsers]);

  const handleClose = () => {
    setIsOpen(false);
    setFormData({ display_name: "", primitive_type: "", description: "", notes: "" });
    setOwnerIds([]);
    setLinkedModelId(null);
    setLinkedProjectId(null);
    setOwnersChanged(false);
    setSaveError(null);
    setUnknownOwnerIds([]);
    resetErrors();
  };

  const handleSubmit = async () => {
    if (!validateAll(formData)) return;

    setIsSubmitting(true);
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        display_name: formData.display_name.trim(),
        primitive_type: formData.primitive_type,
        metadata: formData.notes.trim() ? { notes: formData.notes.trim() } : {},
      };
      // A new agent always gets its owners; an edit sends them only when the
      // owner selection was changed, so other edits leave the owners as they are.
      if (!isEditMode || ownersChanged) payload.owner_ids = ownerIds;
      // The same for the description and links: an edit sends only what changed,
      // so it never overwrites a link set elsewhere since the form was opened.
      const description = formData.description.trim() || null;
      if (!isEditMode || description !== (agent?.description || null)) {
        payload.description = description;
      }
      if (!isEditMode || linkedModelId !== (agent?.linked_model_inventory_id ?? null)) {
        payload.linked_model_inventory_id = linkedModelId;
      }
      if (!isEditMode || linkedProjectId !== (agent?.linked_project_id ?? null)) {
        payload.linked_project_id = linkedProjectId;
      }

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

        <Field
          id="description"
          label="Description"
          type="description"
          rows={3}
          isOptional
          placeholder="What this agent does"
          value={formData.description}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, description: e.target.value }));
            clearFieldError("description");
          }}
          error={errors.description}
        />

        <AutoCompleteField<PickerOption, true>
          multiple
          filterSelectedOptions
          id="owner_ids"
          label="Owners"
          placeholder={selectedOwners.length === 0 ? "Select owners" : undefined}
          value={selectedOwners}
          options={users}
          getOptionLabel={(u) => u.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText={users.length > 0 ? "All users selected" : "No users"}
          onChange={(_e, selected) => {
            setOwnerIds(selected.map((u) => u.id));
            setOwnersChanged(true);
          }}
        />
        {legacyTextOwner && (
          <Typography
            fontSize={12}
            color={palette.text.secondary}
            data-testid="agent-legacy-owner-note"
            sx={{ mt: "-12px", overflowWrap: "anywhere" }}
          >
            {fill(
              t('Current owner "{owner}" is not a VerifyWise user. Choosing owners replaces it.'),
              { owner: legacyTextOwner },
            )}
          </Typography>
        )}
        {unknownOwnerIds.length > 0 && (
          <Typography
            fontSize={12}
            color={palette.text.secondary}
            data-testid="agent-dropped-owners-note"
            sx={{ mt: "-12px" }}
          >
            Some owners are no longer in your organization. They will be removed if you change the
            owners.
          </Typography>
        )}

        <AutoCompleteField<PickerOption>
          id="linked_project_id"
          sx={singlePickerSx}
          label="Linked use case"
          isOptional
          placeholder="Select a use case"
          value={useCases.find((u) => u.id === linkedProjectId) ?? null}
          options={useCases}
          getOptionLabel={(u) => u.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText="No use cases"
          onChange={(_e, selected) => setLinkedProjectId(selected ? selected.id : null)}
        />

        <AutoCompleteField<PickerOption>
          id="linked_model_inventory_id"
          sx={singlePickerSx}
          label="Linked model"
          isOptional
          placeholder="Select a model"
          value={modelOptions.find((m) => m.id === linkedModelId) ?? null}
          options={modelOptions}
          getOptionLabel={(m) => m.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText={modelsFailed ? "Could not load models" : "No models in the inventory"}
          onChange={(_e, selected) => setLinkedModelId(selected ? selected.id : null)}
        />

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
