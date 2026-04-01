import {
  Stack,
  Typography,
  useTheme,
  Autocomplete,
  Box,
  TextField,
} from "@mui/material";
import Field from "../Inputs/Field";
import Select from "../Inputs/Select";
import DatePicker from "../Inputs/Datepicker";
import dayjs, { Dayjs } from "dayjs";
import useUsers from "../../../application/hooks/useUsers";
import { ChevronDown as GreyDownArrowIcon } from "lucide-react";
import { useCallback } from "react";
import { PolicyFormData, PolicyFormProps } from "../../types/interfaces/i.policy";
import { getAutocompleteStyles } from "../../utils/inputStyles";
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
      },
    []
  );

  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    if (newDate?.isValid()) {
      setFormData((prevValues: any) => ({
        ...prevValues,
        nextReviewDate: newDate ? newDate.toISOString() : "",
      }));
    }
  }, []);

  const autocompleteSlotProps = {
    paper: {
      sx: {
        "& .MuiAutocomplete-listbox": {
          "& .MuiAutocomplete-option": {
            fontSize: "13px",
            color: "#1c2130",
            paddingLeft: "9px",
            paddingRight: "9px",
          },
          "& .MuiAutocomplete-option.Mui-focused": {
            background: `${background.accent}`,
          },
        },
        "& .MuiAutocomplete-noOptions": {
          fontSize: "13px",
          paddingLeft: "9px",
          paddingRight: "9px",
        },
      },
    },
  };

  return (
    <Stack direction="row" spacing={2} alignItems="flex-start">
      {/* Policy Title */}
      <Stack sx={{ flex: 2, minWidth: 0 }}>
        <Field
          id="policy-title-input"
          label="Policy title"
          width="100%"
          value={formData.title ?? ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, title: e.target.value }))
          }
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
      <Stack sx={{ gap: "4px", flex: 1.5, minWidth: 0 }}>
        <Typography
          sx={{ fontSize: theme.typography.fontSize, fontWeight: 500, height: "22px", margin: 0, color: theme.palette.text.secondary }}
        >
          Team members
        </Typography>
        <Autocomplete
          multiple
          id="users-input"
          size="small"
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
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select users"
              error={!!errors.assignedReviewers}
              sx={{
                "& .MuiOutlinedInput-root": {
                  paddingTop: "3.8px !important",
                  paddingBottom: "3.8px !important",
                },
                "& ::placeholder": {
                  fontSize: "13px",
                },
              }}
            />
          )}
          sx={{
            backgroundColor: theme.palette.background.main,
            width: "100%",
            cursor: "pointer",
            "& .MuiChip-root": {
              borderRadius: theme.shape.borderRadius,
            },
            ...getAutocompleteStyles(theme, { hasError: !!errors.assignedReviewers }),
            "& .MuiOutlinedInput-root": {
              ...getAutocompleteStyles(theme, { hasError: !!errors.assignedReviewers })["& .MuiOutlinedInput-root"],
              "& fieldset": {
                ...getAutocompleteStyles(theme, { hasError: !!errors.assignedReviewers })["& .MuiOutlinedInput-root"]["& fieldset"],
                borderRadius: "3px",
              },
            },
          }}
          slotProps={autocompleteSlotProps}
        />
        {errors.assignedReviewers && (
          <Typography
            component="span"
            color={theme.palette.error.main}
            sx={{
              opacity: 0.8,
              fontSize: 11,
              mt: 1,
            }}
          >
            {errors.assignedReviewers}
          </Typography>
        )}
      </Stack>

      {/* Tags */}
      <Stack sx={{ gap: "4px", flex: 1.5, minWidth: 0 }}>
        <Typography
          sx={{ fontSize: theme.typography.fontSize, fontWeight: 500, height: "22px", margin: 0, color: theme.palette.text.secondary }}
        >
          Tags
        </Typography>
        <Autocomplete
          multiple
          id="tags-input"
          size="small"
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
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select tags"
              error={!!errors.tags}
              sx={{
                "& .MuiOutlinedInput-root": {
                  paddingTop: "3.8px !important",
                  paddingBottom: "3.8px !important",
                },
                "& ::placeholder": {
                  fontSize: "13px",
                },
              }}
            />
          )}
          sx={{
            backgroundColor: theme.palette.background.main,
            width: "100%",
            cursor: "pointer",
            "& .MuiChip-root": {
              borderRadius: theme.shape.borderRadius,
            },
            ...getAutocompleteStyles(theme, { hasError: !!errors.tags }),
            "& .MuiOutlinedInput-root": {
              ...getAutocompleteStyles(theme, { hasError: !!errors.tags })["& .MuiOutlinedInput-root"],
              "& fieldset": {
                ...getAutocompleteStyles(theme, { hasError: !!errors.tags })["& .MuiOutlinedInput-root"]["& fieldset"],
                borderRadius: "3px",
              },
            },
          }}
          slotProps={autocompleteSlotProps}
        />
        {errors.tags && (
          <Typography
            component="span"
            color={theme.palette.error.main}
            sx={{
              opacity: 0.8,
              fontSize: 11,
              mt: 1,
            }}
          >
            {errors.tags}
          </Typography>
        )}
      </Stack>

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
