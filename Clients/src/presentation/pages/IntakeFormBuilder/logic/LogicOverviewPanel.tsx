import { useMemo, type ReactNode } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { AlertCircle } from "lucide-react";
import type { SchemaLogicError } from "../../../../application/utils/intakeFormLogic";
import type { FormField, FormRouting } from "../types";
import type { RoutingReviewer } from "../routing/RoutingSettingsSection";
import { buildLogicOverview, type ConditionText } from "./logicOverview";

interface LogicOverviewPanelProps {
  fields: FormField[];
  logicErrors: SchemaLogicError[];
  routing: FormRouting | null;
  reviewers: RoutingReviewer[];
  /** Opens the field's editor. */
  onSelectField: (fieldId: string) => void;
}

/** Every calculation, show/hide rule, risk tag and the routing setup of the form, in one list. */
export function LogicOverviewPanel({
  fields,
  logicErrors,
  routing,
  reviewers,
  onSelectField,
}: LogicOverviewPanelProps) {
  const theme = useTheme();
  const overview = useMemo(() => buildLogicOverview(fields, logicErrors), [fields, logicErrors]);
  const text = { fontSize: "13px", color: theme.palette.text.secondary };

  const group = (title: string, children: ReactNode) => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Typography
        component="h3"
        sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );

  const empty = (message: string) => <Typography sx={text}>{message}</Typography>;

  const row = (fieldId: string, label: string, errors: string[], body: ReactNode) => (
    <Box
      key={fieldId}
      component="button"
      type="button"
      onClick={() => onSelectField(fieldId)}
      data-testid={`logic-row-${fieldId}`}
      sx={{
        "display": "flex",
        "flexDirection": "column",
        "gap": "4px",
        "width": "100%",
        "textAlign": "left",
        "p": "8px 10px",
        "border": `1px solid ${errors.length > 0 ? theme.palette.status.error.text : theme.palette.border.dark}`,
        "borderRadius": "4px",
        "backgroundColor": theme.palette.background.main,
        "cursor": "pointer",
        "font": "inherit",
        "&:hover": { backgroundColor: theme.palette.background.accent },
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: "1px",
        },
      }}
    >
      <Typography
        component="span"
        data-vw-no-translate="true"
        sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}
      >
        {label}
      </Typography>
      {body}
      {errors.map((message) => (
        <Typography
          key={message}
          component="span"
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: "4px",
            fontSize: "13px",
            color: theme.palette.status.error.text,
          }}
        >
          <AlertCircle size={14} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
          {message}
        </Typography>
      ))}
    </Box>
  );

  // Field names stay as typed; the fixed words go through the page translator.
  const condition = (part: ConditionText, index: number) => (
    <Box component="li" key={index} sx={{ ...text, ml: "16px" }}>
      <span data-vw-no-translate="true">{part.field}</span> <span>{part.operator}</span>
      {part.value && (
        <>
          {" "}
          <span data-vw-no-translate="true">{part.value}</span>
        </>
      )}
    </Box>
  );

  const names = (ids: number[]) =>
    ids
      .map((id) => reviewers.find((reviewer) => reviewer._id === id)?.name)
      .filter(Boolean)
      .join(", ");

  return (
    <Box
      data-testid="logic-overview-panel"
      sx={{
        width: 325,
        borderLeft: `1px solid ${theme.palette.border.dark}`,
        backgroundColor: theme.palette.background.main,
        overflowY: "auto",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        p: "16px",
      }}
    >
      <Box>
        <Typography
          component="h2"
          sx={{ fontSize: "15px", fontWeight: 600, color: theme.palette.text.primary }}
        >
          Logic
        </Typography>
        <Typography sx={text}>What each rule and formula reads. Click a row to edit it.</Typography>
      </Box>

      {group(
        "Calculations",
        overview.calculations.length === 0
          ? empty("No calculations yet. Add a calculated field from the Advanced section.")
          : overview.calculations.map((item) =>
              row(
                item.fieldId,
                item.fieldLabel,
                item.errors,
                <Typography component="span" data-vw-no-translate="true" sx={text}>
                  {item.formula || "No formula yet"}
                </Typography>,
              ),
            ),
      )}

      {group(
        "Show/hide rules",
        overview.rules.length === 0
          ? empty("No show/hide rules yet.")
          : overview.rules.map((item) =>
              row(
                item.fieldId,
                item.fieldLabel,
                item.errors,
                <>
                  <Typography component="span" sx={text}>
                    {item.match === "any"
                      ? "Shown when any of these match"
                      : "Shown when all of these match"}
                  </Typography>
                  <Box component="ul" sx={{ m: 0, p: 0 }}>
                    {item.conditions.map(condition)}
                  </Box>
                </>,
              ),
            ),
      )}

      {overview.riskTags.length > 0 &&
        group(
          "Risk scoring",
          overview.riskTags.map((item) =>
            row(
              item.fieldId,
              item.fieldLabel,
              item.errors,
              <Typography component="span" sx={text}>
                <span>Feeds</span> <span>{item.dimension}</span>
              </Typography>,
            ),
          ),
        )}

      {group(
        "Routing",
        !routing?.enabled ? (
          empty("Routing is off. Turn it on in Form settings.")
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Box component="ol" sx={{ ...text, m: 0, pl: "20px" }}>
              <li>Prohibited practices go to senior reviewers.</li>
              <li>Submissions without a score go to senior reviewers.</li>
              <li>
                <span>Scores within</span> {routing.closeCallMargin} <span>points of</span>{" "}
                {routing.threshold} <span>go to senior reviewers.</span>
              </li>
              <li>
                <span>Scores of</span> {routing.threshold}{" "}
                <span>or more go to senior reviewers.</span>
              </li>
              <li>Other submissions go to standard reviewers.</li>
            </Box>
            <Typography sx={text}>
              <span>Senior reviewers:</span>{" "}
              <span data-vw-no-translate="true">{names(routing.seniorReviewerIds) || "-"}</span>
            </Typography>
            <Typography sx={text}>
              <span>Standard reviewers:</span>{" "}
              <span data-vw-no-translate="true">{names(routing.standardReviewerIds) || "-"}</span>
            </Typography>
            <Typography sx={text}>
              {routing.secondReviewRate}%{" "}
              <span>of approvals get a second review by another senior reviewer.</span>
            </Typography>
          </Box>
        ),
      )}
    </Box>
  );
}

export default LogicOverviewPanel;
