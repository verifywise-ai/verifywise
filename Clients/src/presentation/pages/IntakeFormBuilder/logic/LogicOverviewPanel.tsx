import { useMemo, type ReactNode } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { AlertCircle } from "lucide-react";
import type { SchemaLogicError } from "../../../../application/utils/intakeFormLogic";
import type { FormField, FormRouting } from "../types";
import type { RoutingReviewer } from "../routing/RoutingSettingsSection";
import { buildLogicOverview, MISSING_FIELD, type ConditionText } from "./logicOverview";

interface LogicOverviewPanelProps {
  fields: FormField[];
  logicErrors: SchemaLogicError[];
  routing: FormRouting | null;
  reviewers: RoutingReviewer[];
  /** False until the reviewer list has loaded. */
  reviewersLoaded: boolean;
  /** Opens the field's editor. */
  onSelectField: (fieldId: string) => void;
}

/** Every calculation, show/hide rule, risk tag and the routing setup of the form, in one list. */
export function LogicOverviewPanel({
  fields,
  logicErrors,
  routing,
  reviewers,
  reviewersLoaded,
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

  // The field name is the button; the row around it also opens the field on a click.
  const row = (key: string, fieldId: string, label: string, errors: string[], body?: ReactNode) => (
    <Box
      key={key}
      data-testid={`logic-row-${fieldId}`}
      onClick={() => onSelectField(fieldId)}
      sx={{
        "display": "flex",
        "flexDirection": "column",
        "gap": "4px",
        "p": "8px 10px",
        "border": `1px solid ${errors.length > 0 ? theme.palette.status.error.text : theme.palette.border.dark}`,
        "borderRadius": "4px",
        "cursor": "pointer",
        "&:hover": { backgroundColor: theme.palette.background.accent },
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelectField(fieldId);
        }}
        sx={{
          "alignSelf": "flex-start",
          "p": 0,
          "border": "none",
          "background": "none",
          "font": "inherit",
          "fontSize": "13px",
          "fontWeight": 600,
          "textAlign": "left",
          "color": theme.palette.text.primary,
          "cursor": "pointer",
          "&:focus-visible": {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: "2px",
            borderRadius: "4px",
          },
        }}
      >
        <span data-vw-no-translate="true">{label}</span>
      </Box>
      {body}
      {errors.map((message, index) => (
        <Typography
          key={index}
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
          <span data-vw-no-translate="true">{message}</span>
        </Typography>
      ))}
    </Box>
  );

  // Field names and values stay as typed; the fixed words go through the page translator.
  const condition = (part: ConditionText, index: number) => (
    <Box component="li" key={index} sx={text}>
      {part.field === MISSING_FIELD ? (
        <span>{MISSING_FIELD}</span>
      ) : (
        <span data-vw-no-translate="true">{part.field}</span>
      )}{" "}
      <span>{part.operator}</span>
      {part.value && (
        <>
          {" "}
          <span data-vw-no-translate="true">{part.value}</span>
        </>
      )}
    </Box>
  );

  // Saved reviewers who can no longer review still count, as in the routing settings.
  const names = (ids: number[]): ReactNode => {
    const known = ids.flatMap((id) => {
      const reviewer = reviewers.find((candidate) => candidate._id === id);
      return reviewer ? [reviewer.name] : [];
    });
    const former = reviewersLoaded ? ids.length - known.length : 0;
    if (known.length === 0 && former === 0) return "-";
    return (
      <>
        <span data-vw-no-translate="true">{known.join(", ")}</span>
        {former > 0 && (
          <>
            {known.length > 0 && ", "}
            <span>Former user</span>
            {former > 1 && ` (${former})`}
          </>
        )}
      </>
    );
  };

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
          : overview.calculations.map((item, index) =>
              row(
                `calc-${index}`,
                item.fieldId,
                item.fieldLabel,
                item.errors,
                item.formula ? (
                  <Typography component="span" data-vw-no-translate="true" sx={text}>
                    {item.formula}
                  </Typography>
                ) : (
                  <Typography component="span" sx={text}>
                    No formula yet
                  </Typography>
                ),
              ),
            ),
      )}

      {group(
        "Conditional fields",
        overview.rules.length === 0
          ? empty("No conditional fields yet.")
          : overview.rules.map((item, index) =>
              row(
                `rule-${index}`,
                item.fieldId,
                item.fieldLabel,
                item.errors,
                <>
                  <Typography component="span" sx={text}>
                    {item.summary}
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: "20px" }}>
                    {item.conditions.map(condition)}
                  </Box>
                </>,
              ),
            ),
      )}

      {overview.riskTags.length > 0 &&
        group(
          "Risk scoring",
          overview.riskTags.map((item, index) =>
            row(
              `tag-${index}`,
              item.fieldId,
              item.fieldLabel,
              item.errors,
              <Typography component="span" sx={text}>
                <span>Feeds</span> <span>{item.dimension}</span>
              </Typography>,
            ),
          ),
        )}

      {overview.otherProblems.length > 0 &&
        group(
          "Other problems",
          overview.otherProblems.map((item, index) =>
            row(`other-${index}`, item.fieldId, item.fieldLabel, item.errors),
          ),
        )}

      {group(
        "Reviewer assignment",
        !routing?.enabled ? (
          empty("Reviewer assignment is off. Turn it on in Form settings.")
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* The order laneFor applies the rules in. */}
            <Box component="ol" sx={{ ...text, m: 0, pl: "20px" }}>
              <li>Prohibited practices go to expert reviewers.</li>
              <li>Submissions without a score go to expert reviewers.</li>
              {routing.closeCallMargin > 0 && (
                <li>
                  <span>Scores less than</span> {routing.closeCallMargin} <span>points from</span>{" "}
                  {routing.threshold} <span>go to expert reviewers.</span>
                </li>
              )}
              <li>
                <span>Scores of</span> {routing.threshold}{" "}
                <span>or more go to expert reviewers.</span>
              </li>
              <li>Other submissions go to regular reviewers.</li>
            </Box>
            <Typography sx={text}>
              <span>Expert reviewers:</span> {names(routing.seniorReviewerIds)}
            </Typography>
            <Typography sx={text}>
              <span>Regular reviewers:</span> {names(routing.standardReviewerIds)}
            </Typography>
            {routing.secondReviewRate > 0 && (
              <Typography sx={text}>
                {routing.secondReviewRate}%{" "}
                <span>
                  of regular review approvals by reviewers who are not expert reviewers are picked
                  at random for a second review by an expert reviewer.
                </span>
              </Typography>
            )}
          </Box>
        ),
      )}
    </Box>
  );
}

export default LogicOverviewPanel;
