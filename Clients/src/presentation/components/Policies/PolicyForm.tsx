import { Stack, Typography, useTheme, Box } from "@mui/material";
import Select from "../Inputs/Select";
import DatePicker from "../Inputs/Datepicker";
import dayjs, { Dayjs } from "dayjs";
import useUsers from "../../../application/hooks/useUsers";
import { ChevronDown as GreyDownArrowIcon } from "lucide-react";
import { useCallback, useEffect } from "react";
import { PolicyFormData, PolicyFormProps } from "../../types/interfaces/i.policy";
import AutoCompleteField from "../Inputs/Autocomplete";

const DEBUG = import.meta.env?.DEV;
const debugLog = (...args: unknown[]) => {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.debug("[PolicyForm]", ...args);
  }
};

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

  useEffect(() => {
    debugLog("mount", {
      titleLen: formData.title?.length ?? 0,
      reviewers: formData.assignedReviewers?.length ?? 0,
      tags: formData.tags?.length ?? 0,
      status: formData.status,
      nextReviewDate: formData.nextReviewDate,
      errors,
    });
  }, []);

  useEffect(() => {
    debugLog("formData changed", {
      titleLen: formData.title?.length ?? 0,
      reviewers: formData.assignedReviewers?.length ?? 0,
      tags: formData.tags?.length ?? 0,
      status: formData.status,
      nextReviewDate: formData.nextReviewDate,
    });
  }, [formData]);

  useEffect(() => {
    if (Object.keys(errors ?? {}).length > 0) {
      debugLog("errors", errors);
    }
  }, [errors]);

  const handleOnMultiSelect = useCallback(
    (prop: keyof PolicyFormData) => (_event: React.SyntheticEvent, newValue: any[]) => {
      debugLog("multiSelect change", { prop, count: newValue?.length ?? 0 });
      setFormData((prevValues) => ({
        ...prevValues,
        [prop]: newValue,
      }));
      clearFieldError(prop);
    },
    [clearFieldError],
  );

  const handleOwnerChange = useCallback(
    (_event: React.SyntheticEvent, newOwner: PolicyFormData["policyOwner"]) => {
      debugLog("owner change", { ownerId: newOwner?.id ?? null });
      setFormData((prev) => ({
        ...prev,
        policyOwner: newOwner,
        assignedReviewers: newOwner
          ? prev.assignedReviewers.filter((u) => u.id !== newOwner.id)
          : prev.assignedReviewers,
      }));
      clearFieldError("policyOwner");
      clearFieldError("assignedReviewers");
    },
    [clearFieldError],
  );

  const handleDateChange = useCallback(
    (newDate: Dayjs | null) => {
      debugLog("date change", { iso: newDate?.toISOString(), valid: newDate?.isValid() });
      if (newDate?.isValid()) {
        setFormData((prevValues: any) => ({
          ...prevValues,
          nextReviewDate: newDate ? newDate.toISOString() : "",
        }));
        clearFieldError("nextReviewDate");
      }
    },
    [clearFieldError],
  );

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      {/* Row 1: Policy owner, Next review date, Status */}
      <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ width: "100%" }}>
        {/* Policy Owner */}
        <AutoCompleteField
          id="policy-owner-input"
          label="Policy owner"
          placeholder="Select policy owner"
          error={errors.policyOwner}
          value={formData.policyOwner}
          options={users || []}
          isOptional
          onChange={handleOwnerChange}
          getOptionLabel={(user) => `${user.name} ${user.surname}`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          renderOption={(props, option) => {
            const { key, ...optionProps } = props;
            const userEmail =
              option.email.length > 30 ? `${option.email.slice(0, 30)}...` : option.email;
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
          popupIcon={<GreyDownArrowIcon size={16} />}
          sx={{ flex: 1, minWidth: 0 }}
        />

        {/* Next Review Date */}
        <Stack sx={{ width: 200, flexShrink: 0 }}>
          <DatePicker
            label="Next review date"
            date={formData.nextReviewDate ? dayjs(formData.nextReviewDate) : null}
            handleDateChange={handleDateChange}
            sx={{ width: "100%" }}
            isRequired
            error={errors.nextReviewDate}
          />
        </Stack>

        {/* Status */}
        <Stack sx={{ width: 180, flexShrink: 0 }}>
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

      {/* Row 2: Team members (reviewers) */}
      <AutoCompleteField
        multiple
        limitTags={2}
        id="users-input"
        label="Team members"
        placeholder="Select users"
        error={errors.assignedReviewers}
        value={formData.assignedReviewers}
        options={
          users.filter(
            (user) =>
              !formData.assignedReviewers.some((u) => u.id === user.id) &&
              user.id !== formData.policyOwner?.id,
          ) || []
        }
        noOptionsText={
          formData.assignedReviewers.length === users.length ? "All members selected" : "No options"
        }
        onChange={handleOnMultiSelect("assignedReviewers")}
        getOptionLabel={(user) => `${user.name} ${user.surname}`}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props;
          const userEmail =
            option.email.length > 30 ? `${option.email.slice(0, 30)}...` : option.email;
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
        sx={{ width: "100%", minWidth: 0 }}
      />

      {/* Row 3: Tags (full width) */}
      <AutoCompleteField
        multiple
        limitTags={5}
        id="tags-input"
        label="Tags"
        placeholder="Select tags"
        error={errors.tags}
        value={formData.tags}
        options={tags.filter((tag) => !formData.tags.includes(tag))}
        noOptionsText={formData.tags.length === tags.length ? "All tags selected" : "No options"}
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
        sx={{ width: "100%", minWidth: 0 }}
      />
    </Stack>
  );
};

export default PolicyForm;
