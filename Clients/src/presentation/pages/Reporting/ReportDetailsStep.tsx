import { Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import Field from "../../components/Inputs/Field";
import Select from "../../components/Inputs/Select";
import Checkbox from "../../components/Inputs/Checkbox";
import DatePicker from "../../components/Inputs/Datepicker";
import { text as textColors } from "../../themes/palette";
import type {
  ReportParameterField,
  ReportParameters,
} from "../../../domain/interfaces/i.reporting";
import { PERIOD_KEYS } from "./reportParameters";
import { FREQUENCY_INTERVAL } from "./scheduleOptions";

const hintSx = { fontSize: 13, lineHeight: 1.5, color: textColors.tertiary };

/**
 * The wizard's "Report details" step: one input per field the template
 * version declares (parameters_config.fields). A schedule derives its period
 * at each run, so in schedule mode the period fields give way to a sentence
 * saying which period each run covers.
 */
export default function ReportDetailsStep({
  fields,
  values,
  errors,
  onChange,
  mode,
  frequency,
}: {
  fields: ReportParameterField[];
  values: ReportParameters;
  /** Errors to show now, keyed by field. */
  errors: Record<string, string>;
  onChange: (key: string, value: string | boolean) => void;
  mode: "schedule" | "run-now";
  frequency: string;
}) {
  const shown = mode === "schedule" ? fields.filter((f) => !PERIOD_KEYS.includes(f.key)) : fields;
  const declaresPeriod = fields.some((f) => PERIOD_KEYS.includes(f.key));
  const interval = FREQUENCY_INTERVAL[frequency] ?? "month";

  return (
    <Stack spacing="16px">
      {mode === "schedule" && declaresPeriod && (
        <Typography sx={hintSx}>
          The reporting period is the {interval} ending the day before each run
        </Typography>
      )}
      {shown.map((field) => {
        const id = `report-details-${field.key}`;
        const raw = values[field.key];
        const text = typeof raw === "string" ? raw : "";
        const error = errors[field.key];

        if (field.type === "boolean") {
          return (
            <Stack key={field.key} spacing="4px">
              <Checkbox
                id={id}
                label={field.label}
                value={field.key}
                size="small"
                isChecked={raw === true}
                onChange={(e) => onChange(field.key, e.target.checked)}
              />
              {field.key === "isFinal" && (
                <Typography sx={hintSx}>Unticked, every page is marked as a draft</Typography>
              )}
            </Stack>
          );
        }

        if (field.type === "date") {
          const date = text ? dayjs(text) : null;
          return (
            <DatePicker
              key={field.key}
              id={id}
              label={field.label}
              isRequired={field.required}
              isOptional={!field.required}
              date={date && date.isValid() ? date : null}
              error={error}
              handleDateChange={(d) =>
                onChange(field.key, d && d.isValid() ? d.format("YYYY-MM-DD") : "")
              }
            />
          );
        }

        if (field.type === "select") {
          return (
            <Select
              key={field.key}
              id={id}
              label={field.label}
              isRequired={field.required}
              isOptional={!field.required}
              placeholder={`Select ${field.label.toLowerCase()}`}
              value={text}
              items={(field.options ?? []).map((o) => ({ _id: o.value, name: o.label }))}
              error={error}
              onChange={(e) => onChange(field.key, String(e.target.value))}
              getOptionValue={(item) => item._id}
            />
          );
        }

        return (
          <Field
            key={field.key}
            id={id}
            label={field.label}
            isRequired={field.required}
            isOptional={!field.required}
            multiline={field.type === "textarea"}
            minRows={field.type === "textarea" ? 3 : undefined}
            value={text}
            error={error}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        );
      })}
    </Stack>
  );
}
