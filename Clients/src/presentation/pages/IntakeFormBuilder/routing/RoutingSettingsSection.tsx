import { useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { useAuth } from "../../../../application/hooks/useAuth";
import Checkbox from "../../../components/Inputs/Checkbox";
import Field from "../../../components/Inputs/Field";
import CustomizableMultiSelect from "../../../components/Inputs/Select/Multi";
import type { FormRouting } from "../types";

export interface RoutingReviewer {
  _id: number;
  name: string;
  email: string;
}

interface RoutingSettingsSectionProps {
  value: FormRouting | null;
  onChange: (next: FormRouting) => void;
  reviewers: RoutingReviewer[];
  /** False while the reviewer list is loading or failed to load: nothing is marked as former then */
  reviewersLoaded?: boolean;
}

type NumberKey = "threshold" | "closeCallMargin" | "secondReviewRate";

const DEFAULT_ROUTING: FormRouting = {
  enabled: true,
  seniorReviewerIds: [],
  standardReviewerIds: [],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 10,
};

// Same limits as the server's validateRoutingSettings.
const RANGES: Record<NumberKey, { min: number; max: number }> = {
  threshold: { min: 1, max: 99 },
  closeCallMargin: { min: 0, max: 25 },
  secondReviewRate: { min: 0, max: 100 },
};

const NUMBER_ERROR = (key: NumberKey) =>
  `Use a number from ${RANGES[key].min} to ${RANGES[key].max}`;

export interface RoutingErrors {
  seniorReviewerIds?: string;
  standardReviewerIds?: string;
  threshold?: string;
  closeCallMargin?: string;
  secondReviewRate?: string;
}

/** Inline errors for the settings; empty while routing is off. */
export function getRoutingErrors(value: FormRouting | null): RoutingErrors {
  const errors: RoutingErrors = {};
  if (!value) return errors;
  // The server checks the numbers whether or not routing is on.
  for (const key of Object.keys(RANGES) as NumberKey[]) {
    const n = value[key];
    if (!Number.isInteger(n) || n < RANGES[key].min || n > RANGES[key].max) {
      errors[key] = NUMBER_ERROR(key);
    }
  }
  if (!value.enabled) return errors;
  if (value.seniorReviewerIds.length === 0) {
    errors.seniorReviewerIds = "Pick at least one expert reviewer";
  }
  if (value.standardReviewerIds.length === 0) {
    errors.standardReviewerIds = "Pick at least one regular reviewer";
  }
  return errors;
}

const NUMBER_FIELDS: Array<{ key: NumberKey; label: string; hint: string }> = [
  { key: "threshold", label: "Threshold", hint: "Risk score that separates the review levels" },
  {
    key: "closeCallMargin",
    label: "Close-call margin",
    hint: "Points either side of the threshold",
  },
  {
    key: "secondReviewRate",
    label: "Second review share %",
    hint: "Share of regular review decisions checked again",
  },
];

const RoutingSettingsSection = ({
  value,
  onChange,
  reviewers,
  reviewersLoaded = true,
}: RoutingSettingsSectionProps) => {
  const theme = useTheme();
  // The server only lets an Admin change routing
  const { userRoleName } = useAuth();
  const canEdit = userRoleName === "Admin";
  // Text being typed, so a field can be emptied without snapping back to a number.
  const [drafts, setDrafts] = useState<Partial<Record<NumberKey, string>>>({});

  const enabled = value?.enabled ?? false;
  const current = value ?? DEFAULT_ROUTING;
  const errors = getRoutingErrors(value);

  // Saved reviewers who can no longer review stay in the lists. Show them so
  // they can be removed; the server accepts a save that keeps them.
  const itemsFor = (ids: number[]): RoutingReviewer[] => {
    if (!reviewersLoaded) return reviewers;
    const known = new Set(reviewers.map((r) => r._id));
    const former = ids
      .filter((id) => !known.has(id))
      .map((id) => ({ _id: id, name: "Former user", email: "" }));
    return [...reviewers, ...former];
  };

  const update = (patch: Partial<FormRouting>) => onChange({ ...current, ...patch });

  const selectSx = {
    "fontSize": 13,
    "minHeight": 34,
    "backgroundColor": theme.palette.background.main,
    "borderRadius": "4px",
    "& .MuiOutlinedInput-input": { paddingTop: "6px", paddingBottom: "6px" },
  };

  const onIds =
    (key: "seniorReviewerIds" | "standardReviewerIds") => (e: { target: { value: unknown } }) => {
      const val = e.target.value;
      update({ [key]: (Array.isArray(val) ? val : [val]).map(Number) });
    };

  // Turning routing off drops any number the server would reject back to its default.
  const onToggle = () => {
    if (enabled) {
      const errs = getRoutingErrors(current);
      const reset: Partial<FormRouting> = {};
      for (const key of Object.keys(RANGES) as NumberKey[]) {
        if (errs[key]) reset[key] = DEFAULT_ROUTING[key];
      }
      setDrafts({});
      update({ ...reset, enabled: false });
    } else {
      update({ enabled: true });
    }
  };

  const onNumber = (key: NumberKey, text: string) => {
    setDrafts((prev) => ({ ...prev, [key]: text }));
    update({ [key]: text.trim() === "" ? NaN : Number(text) });
  };

  return (
    <Box
      data-testid="routing-settings"
      sx={{ display: "flex", flexDirection: "column", gap: "12px" }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: "4px",
          cursor: canEdit ? "pointer" : "default",
        }}
        onClick={() => canEdit && onToggle()}
      >
        <Checkbox
          id="route-by-risk-score"
          isChecked={enabled}
          value="routingEnabled"
          onChange={() => {}}
          size="small"
          label=""
          isDisabled={!canEdit}
          sx={{ p: 0, mt: "1px", flexShrink: 0 }}
        />
        <Box>
          <Typography
            sx={{ fontSize: "12px", fontWeight: 600, color: theme.palette.text.secondary }}
          >
            Assign reviewers by risk score
          </Typography>
          <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
            Send submissions to expert or regular reviewers based on their risk score.
          </Typography>
        </Box>
      </Box>

      {!canEdit && (
        <Typography
          data-testid="routing-admin-only"
          sx={{ fontSize: "11px", color: theme.palette.text.accent }}
        >
          Only an Admin can change reviewer assignment.
        </Typography>
      )}

      {enabled && (
        <>
          <Box>
            <CustomizableMultiSelect
              label="Expert reviewers"
              value={current.seniorReviewerIds}
              onChange={onIds("seniorReviewerIds")}
              items={itemsFor(current.seniorReviewerIds)}
              placeholder="Select expert reviewers"
              error={errors.seniorReviewerIds}
              sx={selectSx}
              disabled={!canEdit}
            />
          </Box>
          <Box>
            <CustomizableMultiSelect
              label="Regular reviewers"
              value={current.standardReviewerIds}
              onChange={onIds("standardReviewerIds")}
              items={itemsFor(current.standardReviewerIds)}
              placeholder="Select regular reviewers"
              error={errors.standardReviewerIds}
              sx={selectSx}
              disabled={!canEdit}
            />
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {NUMBER_FIELDS.map(({ key, label, hint }) => (
              <Field
                key={key}
                id={`routing-${key}`}
                type="number"
                label={label}
                value={drafts[key] ?? String(current[key])}
                onChange={(e) => onNumber(key, e.target.value)}
                min={RANGES[key].min}
                max={RANGES[key].max}
                error={errors[key]}
                helperText={hint}
                disabled={!canEdit}
              />
            ))}
          </Box>

          <Typography
            data-testid="routing-helper"
            sx={{ fontSize: "11px", color: theme.palette.text.accent }}
          >
            <span>Scores of</span> {current.threshold}{" "}
            <span>or more, prohibited practices and scores within</span> {current.closeCallMargin}{" "}
            <span>points of</span> {current.threshold} <span>go to expert reviewers.</span>
          </Typography>
        </>
      )}
    </Box>
  );
};

export default RoutingSettingsSection;
