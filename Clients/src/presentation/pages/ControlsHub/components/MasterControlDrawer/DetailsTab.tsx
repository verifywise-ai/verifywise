/**
 * Controls Hub — Master Control Drawer, Details tab.
 *
 * Straight CRUD form over the master control. All fields are optional except
 * `title` and `status`. On Save, we diff against the loaded model and call
 * the update mutation with a sparse patch so the backend only sees what
 * actually changed — which also narrows the propagation fan-out.
 */
import { useMemo, useState } from "react";
import {
  Alert,
  SelectChangeEvent,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import { GitBranchPlus, Save as SaveIcon } from "lucide-react";

import Field from "../../../../components/Inputs/Field";
import Select from "../../../../components/Inputs/Select";
import DatePicker from "../../../../components/Inputs/Datepicker";
import { CustomizableButton } from "../../../../components/button/customizable-button";
import PropagationPreviewModal from "../PropagationPreviewModal";

import {
  MASTER_CONTROL_RISK_REVIEWS,
  MASTER_CONTROL_STATUSES,
  type MasterControlModel,
  type MasterControlRiskReview,
  type MasterControlStatus,
} from "../../../../../domain/models/Common/masterControl/masterControl.model";
import { useMasterControlMutations } from "../../../../../application/hooks/useMasterControls";
import type {
  MasterControlUpdatePayload,
  PropagationPreviewPayload,
} from "../../../../../application/repository/masterControl.repository";
import useUsers from "../../../../../application/hooks/useUsers";

const INPUT_SX = {
  minWidth: 220,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

interface DetailsTabProps {
  master: MasterControlModel;
  onSaved?: () => void;
}

interface FormState {
  title: string;
  description: string;
  status: MasterControlStatus;
  risk_review: MasterControlRiskReview | "";
  owner: number | "";
  reviewer: number | "";
  approver: number | "";
  implementation_details: string;
}

function toFormState(master: MasterControlModel): FormState {
  return {
    title: master.title ?? "",
    description: master.description ?? "",
    status: master.status ?? "Waiting",
    risk_review: master.risk_review ?? "",
    owner: master.owner ?? "",
    reviewer: master.reviewer ?? "",
    approver: master.approver ?? "",
    implementation_details: master.implementation_details ?? "",
  };
}

/** Build a sparse update payload containing only fields that actually changed. */
function diffPayload(
  original: MasterControlModel,
  form: FormState,
  dueDate: Dayjs | null
): MasterControlUpdatePayload {
  const patch: MasterControlUpdatePayload = {};

  if (form.title.trim() !== (original.title ?? "")) {
    patch.title = form.title.trim();
  }
  if ((form.description ?? "") !== (original.description ?? "")) {
    patch.description = form.description || null;
  }
  if (form.status !== original.status) {
    patch.status = form.status;
  }

  const nextRisk = form.risk_review === "" ? null : form.risk_review;
  if (nextRisk !== (original.risk_review ?? null)) {
    patch.risk_review = nextRisk;
  }

  const nextOwner = form.owner === "" ? null : form.owner;
  if (nextOwner !== (original.owner ?? null)) patch.owner = nextOwner;

  const nextReviewer = form.reviewer === "" ? null : form.reviewer;
  if (nextReviewer !== (original.reviewer ?? null))
    patch.reviewer = nextReviewer;

  const nextApprover = form.approver === "" ? null : form.approver;
  if (nextApprover !== (original.approver ?? null))
    patch.approver = nextApprover;

  const nextDue = dueDate ? dueDate.toISOString() : null;
  const prevDue = original.due_date ?? null;
  // Compare on day-precision so round-trips through the picker don't generate
  // a no-op patch from sub-second drift.
  const prevDay = prevDue ? dayjs(prevDue).startOf("day").toISOString() : null;
  const nextDay = dueDate ? dueDate.startOf("day").toISOString() : null;
  if (prevDay !== nextDay) patch.due_date = nextDue;

  if (
    (form.implementation_details ?? "") !==
    (original.implementation_details ?? "")
  ) {
    patch.implementation_details = form.implementation_details || null;
  }

  return patch;
}

export default function DetailsTab({ master, onSaved }: DetailsTabProps) {
  const theme = useTheme();
  const { users } = useUsers();
  const { update } = useMasterControlMutations();

  const [form, setForm] = useState<FormState>(() => toFormState(master));
  const [dueDate, setDueDate] = useState<Dayjs | null>(
    master.due_date ? dayjs(master.due_date) : null
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const userItems = useMemo(
    () =>
      users.map((u) => ({
        _id: u.id,
        name: u.name,
        surname: u.surname,
        email: u.email,
      })),
    [users]
  );

  /**
   * Subset of the sparse patch that actually propagates to framework rows.
   * Title, description, and risk_review are master-only — they never touch
   * mapped requirements.
   */
  const previewPayload = useMemo<PropagationPreviewPayload>(() => {
    const patch = diffPayload(master, form, dueDate);
    const result: PropagationPreviewPayload = {};
    if (patch.status !== undefined) result.status = patch.status;
    if (patch.owner !== undefined) result.owner = patch.owner ?? null;
    if (patch.reviewer !== undefined) result.reviewer = patch.reviewer ?? null;
    if (patch.approver !== undefined) result.approver = patch.approver ?? null;
    if (patch.due_date !== undefined) result.due_date = patch.due_date ?? null;
    if (patch.implementation_details !== undefined) {
      result.implementation_details = patch.implementation_details ?? null;
    }
    return result;
  }, [master, form, dueDate]);

  const hasPropagatablePatch = Object.keys(previewPayload).length > 0;

  const statusItems = MASTER_CONTROL_STATUSES.map((s) => ({ _id: s, name: s }));
  const riskItems = [
    { _id: "", name: "Not reviewed" },
    ...MASTER_CONTROL_RISK_REVIEWS.map((r) => ({ _id: r, name: r })),
  ];

  const isDemo = Boolean(master.is_demo);
  const disabled = isDemo || update.isPending;

  const onTextChange =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const onSelectChange =
    (key: keyof FormState) => (event: SelectChangeEvent<string | number>) => {
      const raw = event.target.value;
      setForm((prev) => ({ ...prev, [key]: raw as never }));
    };

  const onUserSelectChange =
    (key: "owner" | "reviewer" | "approver") =>
    (event: SelectChangeEvent<string | number>) => {
      const raw = event.target.value;
      setForm((prev) => ({
        ...prev,
        [key]: raw === "" ? "" : Number(raw),
      }));
    };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!master.id) {
      setError("Master control is missing an id — cannot save.");
      return;
    }

    const patch = diffPayload(master, form, dueDate);
    if (Object.keys(patch).length === 0) {
      setSuccess(true);
      return;
    }

    try {
      await update.mutateAsync({ id: master.id, body: patch });
      setSuccess(true);
      onSaved?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save master control."
      );
    }
  };

  return (
    <Stack spacing={3}>
      {isDemo && (
        <Alert severity="info" sx={{ fontSize: 13 }}>
          Demo master controls cannot be edited.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ fontSize: 13 }}>
          {error}
        </Alert>
      )}
      {success && !error && (
        <Alert severity="success" role="status" sx={{ fontSize: 13 }}>
          Saved.
        </Alert>
      )}

      <Field
        id="master-control-title"
        type="text"
        label="Title"
        value={form.title}
        onChange={onTextChange("title")}
        placeholder="Short, unique name for this control"
        isRequired
        disabled={disabled}
      />

      <Field
        id="master-control-description"
        type="description"
        label="Description"
        value={form.description}
        onChange={onTextChange("description")}
        placeholder="What does this control cover?"
        disabled={disabled}
      />

      <Stack direction="row" spacing={2} flexWrap="wrap">
        <Select
          id="master-control-status"
          label="Status"
          value={form.status}
          items={statusItems}
          onChange={onSelectChange("status")}
          sx={INPUT_SX}
          isRequired
          disabled={disabled}
        />
        <Select
          id="master-control-risk-review"
          label="Risk review"
          value={form.risk_review ?? ""}
          items={riskItems}
          onChange={onSelectChange("risk_review")}
          sx={INPUT_SX}
          disabled={disabled}
        />
      </Stack>

      <Stack direction="row" spacing={2} flexWrap="wrap">
        <Select
          id="master-control-owner"
          label="Owner"
          value={form.owner === "" ? "" : form.owner}
          items={[{ _id: "", name: "Unassigned" }, ...userItems]}
          onChange={onUserSelectChange("owner")}
          sx={INPUT_SX}
          disabled={disabled}
        />
        <Select
          id="master-control-reviewer"
          label="Reviewer"
          value={form.reviewer === "" ? "" : form.reviewer}
          items={[{ _id: "", name: "Unassigned" }, ...userItems]}
          onChange={onUserSelectChange("reviewer")}
          sx={INPUT_SX}
          disabled={disabled}
        />
      </Stack>

      <Stack direction="row" spacing={2} flexWrap="wrap">
        <Select
          id="master-control-approver"
          label="Approver"
          value={form.approver === "" ? "" : form.approver}
          items={[{ _id: "", name: "Unassigned" }, ...userItems]}
          onChange={onUserSelectChange("approver")}
          sx={INPUT_SX}
          disabled={disabled}
        />
        <DatePicker
          label="Due date"
          date={dueDate}
          handleDateChange={(d) => setDueDate(d)}
          sx={INPUT_SX}
          disabled={disabled}
        />
      </Stack>

      <Field
        id="master-control-implementation-details"
        type="description"
        label="Implementation details"
        value={form.implementation_details}
        onChange={onTextChange("implementation_details")}
        placeholder="How is this control implemented today?"
        disabled={disabled}
      />

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
        sx={{
          paddingTop: 2,
          borderTop: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <CustomizableButton
          variant="outlined"
          text="Preview propagation"
          icon={<GitBranchPlus size={14} />}
          onClick={() => setIsPreviewOpen(true)}
          isDisabled={disabled || !hasPropagatablePatch || !master.id}
          sx={{ height: 34 }}
        />
        <CustomizableButton
          variant="contained"
          text={update.isPending ? "Saving…" : "Save changes"}
          icon={<SaveIcon size={14} />}
          onClick={handleSave}
          isDisabled={disabled}
          sx={{ minWidth: 160, height: 34 }}
        />
      </Stack>

      <PropagationPreviewModal
        open={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        masterControlId={master.id ?? null}
        payload={previewPayload}
      />

      {master.updated_at && (
        <Typography fontSize={11} color={theme.palette.text.tertiary}>
          Last updated {dayjs(master.updated_at).format("MMM D, YYYY · h:mm A")}
        </Typography>
      )}
    </Stack>
  );
}
