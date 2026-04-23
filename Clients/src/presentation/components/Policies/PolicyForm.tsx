import {
  Stack,
  Typography,
  useTheme,
  Box,
} from "@mui/material";
import Field from "../Inputs/Field";
import Select from "../Inputs/Select";
import DatePicker from "../Inputs/Datepicker";
import dayjs, { Dayjs } from "dayjs";
import useUsers from "../../../application/hooks/useUsers";
import { ChevronDown as GreyDownArrowIcon } from "lucide-react";
import { useCallback } from "react";
import { PolicyFormData, PolicyFormProps } from "../../types/interfaces/i.policy";
import AutoCompleteField from "../Inputs/Autocomplete";
import { background } from "../../themes/palette";


const statuses: PolicyFormData["status"][] = [
  "Draft",
  "Under Review",
  "Approved",
  "Published",
  "Archived",
  "Deprecated",
];

const PolicyForm: React.FC<PolicyFormProps> = ({
  formData,
  setFormData,
  tags,
  errors,
  clearFieldError,
}) => {
  const theme = useTheme();
  const { users } = useUsers();

  const handleOnMultiSelect = useCallback(
    (prop: keyof PolicyFormData) =>
      (_event: React.SyntheticEvent, newValue: any[]) => {
        setFormData((prevValues) => ({
          ...prevValues,
          [prop]: newValue,
        }));
        clearFieldError(prop);
      },
    [clearFieldError]
  );

  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    if (newDate?.isValid()) {
      setFormData((prevValues: any) => ({
        ...prevValues,
        nextReviewDate: newDate ? newDate.toISOString() : "",
      }));
      clearFieldError("nextReviewDate");
    }
  }, [clearFieldError]);

  return (
    <Stack direction="row" spacing={2} alignItems="flex-start">
      {/* Policy Title */}
      <Stack sx={{ flex: 2, minWidth: 0 }}>
        <Field
          id="policy-title-input"
          label="Policy title"
          width="100%"
          value={formData.title ?? ""}
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, title: e.target.value }));
            clearFieldError("title");
          }}
          error={errors.title}
          sx={{
            backgroundColor: `${background.main}`,
            "& input": {
              padding: "0 14px",
            },
          }}
          isRequired
        />
      </Stack>

      {/* Team Members */}
      <AutoCompleteField
        multiple
        id="users-input"
        label="Team members"
        placeholder="Select users"
        error={errors.assignedReviewers}
        value={formData.assignedReviewers}
        options={
          users.filter(
            (user) =>
              !formData.assignedReviewers.some((u) => u.id === user.id)
          ) || []
        }
        noOptionsText={
          formData.assignedReviewers.length === users.length
            ? "All members selected"
            : "No options"
        }
        onChange={handleOnMultiSelect("assignedReviewers")}
        getOptionLabel={(user) => `${user.name} ${user.surname}`}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props;
          const userEmail =
            option.email.length > 30
              ? `${option.email.slice(0, 30)}...`
              : option.email;
          return (
            <Box key={key} component="li" {...optionProps}>
              <Typography sx={{ fontSize: "13px" }}>
                {option.name} {option.surname}
              </Typography>
              <Typography
                sx={{
                  fontSize: "11px",
                  color: "rgb(157, 157, 157)",
                  position: "absolute",
                  right: "9px",
                }}
              >
                {userEmail}
              </Typography>
            </Box>
          );
        }}
        filterSelectedOptions
        popupIcon={<GreyDownArrowIcon size={16} />}
        sx={{ flex: 1.5, minWidth: 0 }}
      />

      {/* Tags */}
      <AutoCompleteField
        multiple
        id="tags-input"
        label="Tags"
        placeholder="Select tags"
        error={errors.tags}
        value={formData.tags}
        options={tags.filter((tag) => !formData.tags.includes(tag))}
        noOptionsText={
          formData.tags.length === tags.length
            ? "All tags selected"
            : "No options"
        }
        onChange={handleOnMultiSelect("tags")}
        getOptionLabel={(tag) => tag}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props;
          return (
            <Box key={key} component="li" {...optionProps}>
              <Typography sx={{ fontSize: "13px" }}>{option}</Typography>
            </Box>
          );
        }}
        filterSelectedOptions
        popupIcon={<GreyDownArrowIcon size={16} />}
        sx={{ flex: 1.5, minWidth: 0 }}
      />

      {/* Next Review Date */}
      <Stack sx={{ width: 160, flexShrink: 0 }}>
        <DatePicker
          label="Next review date"
          date={
            formData.nextReviewDate ? dayjs(formData.nextReviewDate) : null
          }
          handleDateChange={handleDateChange}
          sx={{ width: "100%" }}
          isRequired
          error={errors.nextReviewDate}
        />
      </Stack>

      {/* Status */}
      <Stack sx={{ width: 140, flexShrink: 0 }}>
        <Select
          id="status-input"
          label="Status"
          placeholder="Select status"
          value={formData.status ?? ""}
          onChange={(e) => {
            const statusValue = e.target.value;
            if (typeof statusValue === "string") {
              setFormData((prev) => ({ ...prev, status: statusValue }));
              clearFieldError("status");
            }
          }}
          items={statuses.map((s) => ({ _id: s, name: s }))}
          sx={{
            width: "100%",
            backgroundColor: theme.palette.background.main,
          }}
          error={errors.status}
          isRequired
        />
      </Stack>
    </Stack>
  );
};

export default PolicyForm;
