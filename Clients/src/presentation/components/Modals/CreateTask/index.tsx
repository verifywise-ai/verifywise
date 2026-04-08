/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  FC,
  useState,
  useCallback,
  useEffect,
  Suspense,
  useMemo,
} from "react";
import {
  useTheme,
  Stack,
  Typography,
  Autocomplete,
  TextField,
  Box,
} from "@mui/material";
import { lazy } from "react";
const Field = lazy(() => import("../../Inputs/Field"));
const DatePicker = lazy(() => import("../../Inputs/Datepicker"));
import SelectComponent from "../../Inputs/Select";
import ChipInput from "../../Inputs/ChipInput";
import EntityLinkSelector, { EntityLink } from "../../EntityLinkSelector";
import { ChevronDown as GreyDownArrowIcon, Flag } from "lucide-react";
import StandardModal from "../StandardModal";
import TabBar from "../../TabBar";
import { TabContext } from "@mui/lab";
import { HistorySidebar } from "../../Common/HistorySidebar";
import {
  ICreateTaskFormValues,
  ICreateTaskProps,
} from "../../../types/interfaces/i.task";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import dayjs, { Dayjs } from "dayjs";
import { datePickerStyle } from "../../Forms/ProjectForm/style";
import useUsers from "../../../../application/hooks/useUsers";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import { TaskPriority, TaskStatus } from "../../../../domain/enums/task.enum";
import { getAutocompleteStyles } from "../../../utils/inputStyles";
import { CustomSelect } from "../../CustomSelect";
import { PRIORITY_COLOR_MAP, PRIORITY_DISPLAY_MAP, TASK_PRIORITY_OPTIONS } from "../../../constants/priorityOptions";

const initialState: ICreateTaskFormValues = {
  title: "",
  description: "",
  priority: TaskPriority.MEDIUM,
  status: TaskStatus.OPEN,
  due_date: "",
  assignees: [],
  categories: [],
  entity_links: [],
};

const statusOptions = [
  { _id: TaskStatus.OPEN, name: "Open" },
  { _id: TaskStatus.IN_PROGRESS, name: "In progress" },
  { _id: TaskStatus.COMPLETED, name: "Completed" },
];

const CreateTask: FC<ICreateTaskProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  initialData,
  mode = "create",
}) => {
  const theme = useTheme();
  const { users } = useUsers();
  const [values, setValues] = useState<ICreateTaskFormValues>(initialState);
  const validators = useMemo(
    () => ({
      title: (v: unknown) => {
        const r = checkStringValidation("Task title", v as string, 1, 64);
        return r.accepted ? "" : r.message;
      },
      description: (v: unknown) => {
        const r = checkStringValidation("Description", v as string, 0, 256);
        return r.accepted ? "" : r.message;
      },
      priority: (v: unknown) => (!v ? "Priority is required." : ""),
      status: (v: unknown) => (!v ? "Status is required." : ""),
      due_date: (v: unknown) => (!v ? "Due date is required." : ""),
      assignees: (v: unknown) => {
        const assignees = v as ICreateTaskFormValues["assignees"];
        if (!assignees || assignees.length === 0) {
          return "At least one assignee is required.";
        }
        const ids = assignees.map((a) => String(a.id));
        if (new Set(ids).size !== ids.length) {
          return "Assignees cannot contain duplicates.";
        }
        return "";
      },
    }),
    []
  );
  const { errors, validateAll, validateField, clearFieldError, resetErrors } =
    useFormValidation<ICreateTaskFormValues>(validators);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    if (!isOpen) {
      setValues(initialState);
      resetErrors();
      setIsSubmitting(false);
    } else if (isOpen && mode === "edit" && initialData) {
      setValues({
        title: initialData.title,
        description: initialData.description || "",
        priority: initialData.priority,
        status: initialData.status,
        due_date: initialData.due_date
          ? dayjs(initialData.due_date).format("YYYY-MM-DD")
          : "",
        assignees: (() => {
          if (!initialData.assignees || !users) return [];


          // Handle both possible data structures
          return initialData.assignees
            .map((assignee) => {
              // If assignee is a string/number (user ID)
              if (
                typeof assignee === "string" ||
                typeof assignee === "number"
              ) {
                const user = users.find((u) => u.id === Number(assignee));
                return user
                  ? {
                    id: user.id,
                    name: user.name,
                    surname: user.surname || "",
                    email: user.email,
                  }
                  : null;
              }
              // If assignee is an ITaskAssignee object
              else if (
                assignee &&
                typeof assignee === "object" &&
                "user_id" in assignee
              ) {
                const user = users.find(
                  (u) => u.id === Number(assignee.user_id)
                );
                return user
                  ? {
                    id: user.id,
                    name: user.name,
                    surname: user.surname || "",
                    email: user.email,
                  }
                  : null;
              }
              return null;
            })
            .filter(
              (
                user
              ): user is {
                id: number;
                name: string;
                surname: string;
                email: string;
              } => user !== null
            );
        })(),
        categories: initialData.categories || [],
        entity_links: (initialData as any).entity_links || [],
      });
    } else {
      setValues(initialState);
    }
  }, [isOpen, mode, initialData, users]);

  const handleOnTextFieldChange = useCallback(
    (prop: keyof ICreateTaskFormValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setValues((prev) => ({ ...prev, [prop]: value }));
        clearFieldError(prop);
      },
    [clearFieldError]
  );

  const handleOnSelectChange = useCallback(
    (prop: keyof ICreateTaskFormValues) => (event: any) => {
      const value = event.target.value;
      setValues((prev) => ({ ...prev, [prop]: value }));
      clearFieldError(prop);
    },
    [clearFieldError]
  );

  const handlePrioritySelect = useCallback(async (newValue: string) => {
    setValues((prev) => ({ ...prev, priority: newValue as TaskPriority }));
    clearFieldError("priority");
    return true;
  }, [clearFieldError]);

  const handleAssigneesChange = useCallback(
    (_event: React.SyntheticEvent, newValue: any[]) => {
      // Use stable duplicate check with string-based IDs
      const assigneeIds = newValue.map((a) => String(a.id));
      const uniqueAssigneeIds = [...new Set(assigneeIds)];

      // If duplicates were found, remove them automatically
      const uniqueAssignees = uniqueAssigneeIds
        .map((id) => newValue.find((assignee) => String(assignee.id) === id))
        .filter(Boolean);

      setValues((prev) => ({ ...prev, assignees: uniqueAssignees }));
      if (uniqueAssignees.length === 0) {
        validateField("assignees", uniqueAssignees, { ...values, assignees: uniqueAssignees });
      } else {
        clearFieldError("assignees");
      }
    },
    [clearFieldError, validateField, values]
  );

  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    if (newDate?.isValid()) {
      setValues((prev) => ({
        ...prev,
        due_date: newDate ? newDate.toISOString().split("T")[0] : "",
      }));
      clearFieldError("due_date");
    }
  }, [clearFieldError]);

  const handleEntityLinksChange = useCallback((newLinks: EntityLink[]) => {
    setValues((prev) => ({
      ...prev,
      entity_links: newLinks,
    }));
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setActiveTab("details");
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();

    if (validateAll(values)) {
      setIsSubmitting(true);
      try {
        if (onSuccess) {
          // Convert assignees back to string array for API
          const formattedValues = {
            ...values,
            assignees: values.assignees.map((user) => String(user.id)),
          };
          await onSuccess(formattedValues as any);
        }
        handleClose();
      } catch (error) {
        console.error("Error submitting task:", error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Add modal key handling
  useModalKeyHandling({
    isOpen,
    onClose: handleClose,
  });

  // Memoize options computation to avoid remapping on every render
  const assigneeOptions = useMemo(() => {
    return (users ?? [])
      .map((user) => ({
        id: user.id,
        name: user.name,
        surname: user.surname ?? "",
        email: user.email,
      }))
      .filter((u) => !values.assignees?.some((a) => a.id === u.id));
  }, [users, values.assignees]);

  // Create consistent field style
  const fieldStyle = useMemo(
    () => ({
      backgroundColor: theme.palette.background.main,
      "& input": {
        padding: "0 14px",
      },
    }),
    [theme.palette.background.main]
  );

  const isEditMode = mode === "edit";
  const taskEntityId = initialData?.id;

  const formContent = (
    <Stack spacing={6}>
      {/* Row 1: Task title | Assignees */}
      <Stack direction="row" spacing={6} sx={{ width: "748px" }}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="title"
            label="Task title"
            width="350px"
            value={values.title}
            onChange={handleOnTextFieldChange("title")}
            error={errors.title}
            isRequired
            sx={fieldStyle}
            placeholder="Enter task title"
          />
        </Suspense>

        <Suspense fallback={<div>Loading...</div>}>
          <Stack gap={theme.spacing(2)}>
            <Typography
              component="p"
              variant="body1"
              color={theme.palette.text.secondary}
              fontWeight={500}
              fontSize={"13px"}
              sx={{ margin: 0, height: "22px" }}
            >
              Assignees *
            </Typography>
            <Autocomplete
              multiple
              id="assignees-input"
              size="small"
              value={values.assignees}
              options={assigneeOptions}
              onChange={handleAssigneesChange}
              getOptionLabel={(user) =>
                `${user.name} ${user.surname}`.trim()
              }
              renderOption={(props, option) => {
                const { key, ...optionProps } = props;
                const userEmail =
                  option.email.length > 30
                    ? `${option.email.slice(0, 30)}...`
                    : option.email;
                return (
                  <Box component="li" key={key} {...optionProps}>
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
              noOptionsText={
                values.assignees.length === (users?.length ?? 0)
                  ? "All members selected"
                  : "No options"
              }
              popupIcon={<GreyDownArrowIcon size={16} />}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select assignees"
                  error={!!errors.assignees}
                  aria-describedby={
                    errors.assignees ? "assignees-error" : undefined
                  }
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      minHeight: "34px",
                      paddingTop: "2px !important",
                      paddingBottom: "2px !important",
                    },
                    "& ::placeholder": {
                      fontSize: "13px",
                    },
                  }}
                />
              )}
              sx={{
                ...getAutocompleteStyles(theme, { hasError: !!errors.assignees }),
                width: "350px",
                backgroundColor: theme.palette.background.main,
                "& .MuiOutlinedInput-root": {
                  ...getAutocompleteStyles(theme, { hasError: !!errors.assignees })["& .MuiOutlinedInput-root"],
                  borderRadius: "5px",
                },
                "& .MuiChip-root": {
                  borderRadius: theme.shape.borderRadius,
                  height: "26px",
                  margin: "1px 2px",
                },
              }}
              slotProps={{
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
                        background: "background.accent",
                      },
                    },
                    "& .MuiAutocomplete-noOptions": {
                      fontSize: "13px",
                      paddingLeft: "9px",
                      paddingRight: "9px",
                    },
                  },
                },
              }}
            />
            {errors.assignees && (
              <Typography
                id="assignees-error"
                color="error"
                variant="caption"
                sx={{
                  mt: theme.spacing(1),
                  ml: theme.spacing(1),
                  color: theme.palette.error.main,
                  fontSize: theme.typography.caption.fontSize,
                }}
              >
                {errors.assignees}
              </Typography>
            )}
          </Stack>
        </Suspense>
      </Stack>

      {/* Row 2: Status | Categories */}
      <Stack direction="row" spacing={6} sx={{ width: "748px" }}>
        <SelectComponent
          items={statusOptions}
          value={values.status}
          error={errors.status}
          sx={{
            width: "350px",
            backgroundColor: theme.palette.background.main,
          }}
          id="status"
          label="Status"
          isRequired
          onChange={handleOnSelectChange("status")}
          placeholder="Select status"
        />

        <ChipInput
          id="categories-input"
          label="Categories"
          value={values.categories}
          onChange={(newValue) => {
            setValues((prevValues) => ({
              ...prevValues,
              categories: newValue,
            }));
            clearFieldError("categories");
          }}
          placeholder="Enter categories"
          error={errors.categories}
          sx={{ width: "350px" }}
        />
      </Stack>

      {/* Row 3: Priority | Due date */}
      <Stack direction="row" spacing={6} sx={{ width: "748px" }}>
        <Stack gap={theme.spacing(2)} sx={{ width: "350px" }}>
          <Typography
            component="p"
            variant="body1"
            color={theme.palette.text.secondary}
            fontWeight={500}
            fontSize={"13px"}
            sx={{ margin: 0, height: "22px" }}
          >
            Priority *
          </Typography>
          <CustomSelect
            currentValue={values.priority}
            onValueChange={handlePrioritySelect}
            options={TASK_PRIORITY_OPTIONS.map((priority) => {
              const displayPriority =
                PRIORITY_DISPLAY_MAP[priority as TaskPriority] || priority;
              return {
                value: priority,
                label: displayPriority,
                icon: Flag,
                color: PRIORITY_COLOR_MAP[priority as TaskPriority],
              };
            })}
            disabled={isSubmitting}
            size="medium"
            sx={{
              width: "350px",
              backgroundColor: theme.palette.background.main,
            }}
          />
          {errors.priority && (
            <Typography
              color="error"
              variant="caption"
              sx={{
                mt: theme.spacing(0.5),
                ml: theme.spacing(0.5),
                color: theme.palette.error.main,
                fontSize: theme.typography.caption.fontSize,
              }}
            >
              {errors.priority}
            </Typography>
          )}
        </Stack>

        <Suspense fallback={<div>Loading...</div>}>
          <DatePicker
            label="Due date"
            date={values.due_date ? dayjs(values.due_date) : null}
            handleDateChange={handleDateChange}
            sx={{
              ...datePickerStyle,
              width: "350px",
              backgroundColor: theme.palette.background.main,
            }}
            isRequired
            error={errors.due_date}
          />
        </Suspense>
      </Stack>

      {/* Row 4: Description (full width) */}
      <Stack direction="row" spacing={6} sx={{ width: "748px" }}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="description"
            label="Description"
            width="100%"
            type="description"
            value={values.description}
            onChange={handleOnTextFieldChange("description")}
            error={errors.description}
            sx={fieldStyle}
            placeholder="Enter description"
          />
        </Suspense>
      </Stack>

      {/* Row 5: Entity Links */}
      <Stack direction="row" spacing={6} sx={{ width: "748px" }}>
        <Box sx={{ width: "100%" }}>
          <EntityLinkSelector
            value={values.entity_links}
            onChange={handleEntityLinksChange}
            disabled={isSubmitting}
          />
        </Box>
      </Stack>
    </Stack>
  );

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditMode ? "Edit task" : "Create new task"}
      description={
        isEditMode
          ? "Update task details and assign team members."
          : "Create a new task by filling in the following details."
      }
      onSubmit={activeTab === "details" ? handleSubmit : undefined}
      submitButtonText={isEditMode ? "Update task" : "Create task"}
      isSubmitting={isSubmitting}
      maxWidth="800px"
    >
      {isEditMode && taskEntityId ? (
        <TabContext value={activeTab}>
          <Box sx={{ marginBottom: 3 }}>
            <TabBar
              tabs={[
                { label: "Task details", value: "details", icon: "CheckSquare" },
                { label: "Activity", value: "activity", icon: "History" },
              ]}
              activeTab={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
            />
          </Box>
          {activeTab === "details" && formContent}
          {activeTab === "activity" && (
            <HistorySidebar
              inline
              isOpen={true}
              entityType="task"
              entityId={taskEntityId}
            />
          )}
        </TabContext>
      ) : (
        formContent
      )}
    </StandardModal>
  );
};

export default CreateTask;
