/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  FC,
  useState,
  useMemo,
  useCallback,
  useEffect,
  Suspense,
} from "react";
import {
  useTheme,
  Stack,
  Box,
  FormControlLabel,
  Autocomplete,
  TextField,
  Typography,
  IconButton,
  Tooltip,
} from "@mui/material";
import Toggle from "../../Inputs/Toggle";
import { lazy } from "react";
const Field = lazy(() => import("../../Inputs/Field"));
const DatePicker = lazy(() => import("../../Inputs/Datepicker"));
import SelectComponent from "../../Inputs/Select";
import {
  ChevronDown,
  DownloadIcon,
} from "lucide-react";
import StandardModal from "../StandardModal";
import { ModelInventoryStatus } from "../../../../domain/enums/modelInventory.enum";
import { HistorySidebar } from "../../Common/HistorySidebar";
import { useModelInventoryChangeHistory } from "../../../../application/hooks/useModelInventoryChangeHistory";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { User } from "../../../../domain/types/User";
import dayjs, { Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import modelInventoryOptions from "../../../utils/model-inventory.json";
import { useProjects } from "../../../../application/hooks/useProjects";
import { Project } from "../../../../domain/types/Project";
import { getAutocompleteStyles } from "../../../utils/inputStyles";
import FileManagerUploadModal from "../FileManagerUpload";
import { CustomizableButton } from "../../button/customizable-button";
import {
  FileResponse,
  IModelInventory,
} from "../../../../domain/interfaces/i.modelInventory";
import { Trash2 as DeleteIconGrey } from "lucide-react";

import TabBar from "../../TabBar";
import { TabContext } from "@mui/lab";
import EvidenceHubTable from "../../../pages/ModelInventory/evidenceHubTable";
import { EvidenceHubModel } from "../../../../domain/models/Common/evidenceHub/evidenceHub.model";
import { addNewModelButtonStyle } from "../../../pages/ModelInventory/style";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import { VWLink } from "../../Link/VWLink";
import { useQueryClient } from "@tanstack/react-query";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { checkStringValidation } from "../../../../application/validations/stringValidation";

dayjs.extend(utc);

interface NewModelInventoryProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSuccess?: (data: NewModelInventoryFormValues) => void;
  onError?: (error: any) => void;
  initialData?: NewModelInventoryFormValues;
  isEdit?: boolean;
  selectedModelInventoryId?: string | number;
  evidenceData: EvidenceHubModel[];
  handleEditEvidence?: (id: number) => void;
  handleDeleteEvidence?: (id: number) => void;
  handleAddEvidence?: (modelId?: number) => void;
  modelInventoryData: IModelInventory[];
}

interface NewModelInventoryFormValues {
  provider_model?: string; // Keep for backward compatibility
  provider: string;
  model: string;
  version: string;
  approver?: number;
  capabilities: string[];
  security_assessment: boolean;
  status: ModelInventoryStatus;
  status_date: string;
  reference_link: string;
  biases: string;
  limitations: string;
  hosting_provider: string;
  projects: number[];
  frameworks: number[];
  security_assessment_data: FileResponse[];
}



const initialState: NewModelInventoryFormValues = {
  provider_model: "", // Keep for backward compatibility
  provider: "",
  model: "",
  version: "",
  approver: "" as any, // Initialize as empty string to avoid MUI select warning
  capabilities: [],
  security_assessment: false,
  status: ModelInventoryStatus.PENDING,
  status_date: new Date().toISOString().split("T")[0],
  reference_link: "",
  biases: "",
  limitations: "",
  hosting_provider: "",
  projects: [],
  frameworks: [],
  security_assessment_data: [],
};

const statusOptions = [
  { _id: ModelInventoryStatus.APPROVED, name: "Approved" },
  { _id: ModelInventoryStatus.RESTRICTED, name: "Restricted" },
  { _id: ModelInventoryStatus.PENDING, name: "Pending" },
  { _id: ModelInventoryStatus.BLOCKED, name: "Blocked" },
];

const capabilityOptions = [
  "Vision",
  "Caching",
  "Tools",
  "Code",
  "Multimodal",
  "Audio",
  "Video",
  "Text Generation",
  "Translation",
  "Summarization",
  "Question Answering",
  "Sentiment Analysis",
  "Named Entity Recognition",
  "Image Classification",
  "Object Detection",
  "Speech Recognition",
  "Text-to-Speech",
  "Recommendation",
  "Anomaly Detection",
  "Forecasting",
];

const NewModelInventory: FC<NewModelInventoryProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  onError,
  initialData,
  evidenceData,
  isEdit = false,
  selectedModelInventoryId,
  handleEditEvidence,
  handleAddEvidence,
  handleDeleteEvidence,
  modelInventoryData,
}) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<NewModelInventoryFormValues>(
    initialData || initialState
  );
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [isEvidenceLoading] = useState(false);

  const validators = useMemo(
    () => ({
      provider: (v: unknown) => {
        const r = checkStringValidation("Provider", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      model: (v: unknown) => {
        const r = checkStringValidation("Model", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      version: (v: unknown) => {
        const r = checkStringValidation("Version", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      status: (v: unknown) => {
        if (!v) return "Status is required.";
        return "";
      },
      status_date: (v: unknown) => {
        const r = checkStringValidation("Status date", v as string, 1);
        return r.accepted ? "" : r.message;
      },
      security_assessment_data: (
        v: unknown,
        vals: NewModelInventoryFormValues
      ) => {
        if (vals.security_assessment && (!v || (v as FileResponse[]).length === 0)) {
          return "At least one file must be uploaded when security assessment is complete.";
        }
        return "";
      },
    }),
    []
  );

  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<NewModelInventoryFormValues>(validators);

  // Prefetch history data when modal opens in edit mode
  // This ensures data is ready before user opens the sidebar
  useModelInventoryChangeHistory(
    isOpen && isEdit ? (selectedModelInventoryId as number) : undefined
  );

  useEffect(() => {
    if (isOpen) {
      // When modal opens, set the form values
      if (initialData) {
        // Normalize the data
        const normalizedData = {
          ...initialData,
          projects: Array.isArray(initialData.projects)
            ? [...initialData.projects]
            : [],
          frameworks: Array.isArray(initialData.frameworks)
            ? [...initialData.frameworks]
            : [],
          capabilities: Array.isArray(initialData.capabilities)
            ? [...initialData.capabilities]
            : [],
        };
        setValues(normalizedData);
      } else {
        // If not editing and no initial data, set initial state
        setValues(initialState);
      }
      resetErrors();
      setIsSubmitting(false); // Reset submitting state when modal opens
    } else {
      // When modal closes, reset everything
      setValues(initialState);
      resetErrors();
      setIsSubmitting(false); // Reset submitting state when modal closes
    }
  }, [isOpen, initialData, isEdit, resetErrors]);

  // Fetch users when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const evidenceForThisModel = useMemo(() => {
    if (!selectedModelInventoryId) return [];

    const filtered = (evidenceData ?? []).filter((item) =>
      item.mapped_model_ids?.includes(Number(selectedModelInventoryId))
    );

    return filtered;
  }, [evidenceData, selectedModelInventoryId]);

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const response = await getAllEntities({ routeUrl: "/users" });
      if (response?.data) {
        setUsers(response.data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Use the useProjects hook to get approved projects
  const { approvedProjects } = useProjects();

  // Filter to get only non-organizational approved projects (use cases)
  const projectList = useMemo(() => {
    return Array.isArray(approvedProjects)
      ? approvedProjects.filter((project: Project) => !project.is_organizational)
      : [];
  }, [approvedProjects]);

  const projectsList = useMemo(() => {
    return projectList.map((project: Project) => project.project_title.trim());
  }, [projectList]);

  // Get organizational projects to extract enabled frameworks
  const organizationalProjects = useMemo(() => {
    return Array.isArray(approvedProjects)
      ? approvedProjects.filter((project: Project) => project.is_organizational)
      : [];
  }, [approvedProjects]);

  // Create a mapping from framework ID to framework name (from organizational projects)
  const frameworkIdToNameMap = useMemo(() => {
    const map = new Map<number, string>();
    const targetFrameworks = ["ISO 42001", "ISO 27001", "NIST AI RMF"];

    organizationalProjects.forEach((project) => {
      project.framework?.forEach((f) => {
        if (targetFrameworks.includes(f.name)) {
          map.set(f.framework_id, f.name);
        }
      });
    });

    return map;
  }, [organizationalProjects]);

  const frameworksList = useMemo(() => {
    return Array.from(frameworkIdToNameMap.values());
  }, [frameworkIdToNameMap]);

  // Transform users to the format expected by SelectComponent
  const userOptions = useMemo(() => {
    return users.map((user) => ({
      _id: user.id,
      name: `${user.name} ${user.surname}`,
      email: user.email,
    }));
  }, [users]);

  const modelInventoryList = useMemo(() => {
    return modelInventoryOptions.map(
      (u: { model: string; provider: string }) => ({
        _id: u.model,
        name: `${u.provider} - ${u.model}`,
        surname: u.model,
        email: u.model,
      })
    );
  }, []);

  // Button should be enabled for new items or always enabled during edit
  // Simplified: only disable during submission
  const isButtonDisabled = isSubmitting;

  const handleOnTextFieldChange = useCallback(
    (prop: keyof NewModelInventoryFormValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setValues((prev) => ({ ...prev, [prop]: value }));
        clearFieldError(prop);
      },
    [clearFieldError]
  );

  const handleOnSelectChange = useCallback(
    (prop: keyof NewModelInventoryFormValues) => (event: any) => {
      const value = event.target.value;
      setValues((prev) => ({ ...prev, [prop]: value }));
      clearFieldError(prop);
    },
    [clearFieldError]
  );

  const handleCapabilityChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string[]) => {
      setValues((prev) => ({ ...prev, capabilities: newValue }));
      clearFieldError("capabilities");
    },
    [clearFieldError]
  );

  const handleSelectUsedInProjectChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string[]) => {
      // Convert project titles to IDs
      const projectIds = newValue
        .map((title) => projectList.find((p) => p.project_title === title)?.id)
        .filter((id): id is number => id !== undefined);
      setValues((prev) => ({ ...prev, projects: projectIds }));
      clearFieldError("projects");
    },
    [projectList, clearFieldError]
  );

  const handleSelectUsedInFrameworksChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string[]) => {
      // Convert framework names to IDs using the mapping
      const frameworkIds = newValue
        .map((name) => {
          // Find framework ID by name
          for (const [id, frameworkName] of frameworkIdToNameMap.entries()) {
            if (frameworkName === name) {
              return id;
            }
          }
          return undefined;
        })
        .filter((id): id is number => id !== undefined);
      setValues((prev) => ({ ...prev, frameworks: frameworkIds }));
      clearFieldError("frameworks");
    },
    [frameworkIdToNameMap, clearFieldError]
  );

  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    if (newDate?.isValid()) {
      setValues((prev) => ({
        ...prev,
        status_date: newDate ? newDate.format("YYYY-MM-DD") : "",
      }));
      clearFieldError("status_date");
    }
  }, [clearFieldError]);

  const handleSecurityAssessmentChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({
        ...prev,
        security_assessment: event.target.checked,
      }));
    },
    []
  );

  const handleUploadSuccess = (data: FileResponse[]) => {
    setValues((prevValues) => {
      return {
        ...prevValues,
        security_assessment_data: [
          ...prevValues.security_assessment_data,
          ...data.map((item) => item), //
        ],
      };
    });

    // Clear error for security assessment files
    clearFieldError("security_assessment_data");

    setIsUploadModalOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setActiveTab("details");
    // Invalidate change history cache when modal closes
    // This ensures fresh data is fetched when reopening the modal
    queryClient.invalidateQueries({
      queryKey: ["changeHistory", "model_inventory", selectedModelInventoryId],
    });
  };

  useModalKeyHandling({
    isOpen,
    onClose: handleClose,
  });

  const handleSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (validateAll(values)) {
      setIsSubmitting(true);
      try {
        if (onSuccess) {
          await onSuccess({
            ...values,
            capabilities: values.capabilities,
            security_assessment: values.security_assessment,
          });
        }
        handleClose();
      } catch (error: any) {
        setIsSubmitting(false);
        // Propagate error to parent for toast notification
        if (onError) {
          onError(error);
        }
      }
    }
  };

  const handleDownloadEvidence = (data: EvidenceHubModel[] = []) => {
    if (!data || data.length === 0) {
      console.warn("No evidence data to download.");
      return;
    }

    // Map data to rows
    const rows = data.map((item) => ({
      ID: item.id,
      Title: item.evidence_name || "",
      Type: item.evidence_type || "",
      "Mapped Models": item.mapped_model_ids?.join(", ") || "",
      DESCRIPTION: item.description,
      EXPIRY_DATE: item.expiry_date
        ? dayjs.utc(item.expiry_date).format("YYYY-MM-DD")
        : "-",
    }));

    // Extract CSV header from object keys
    const header = Object.keys(rows[0]).join(",");
    const csvRows = rows.map((row) =>
      Object.values(row)
        .map((val) => `"${String(val).replace(/"/g, '""')}"`) // escape quotes
        .join(",")
    );

    const csvContent = [header, ...csvRows].join("\r\n");

    // Create a blob and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", "evidence_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fieldStyle = useMemo(
    () => ({
      backgroundColor: theme.palette.background.main,
      "& input": {
        padding: "0 14px",
      },
    }),
    [theme.palette.background.main]
  );

  // Styles for Autocomplete (following ProjectForm approach)
  const capabilitiesRenderInputStyle = {
    "& .MuiOutlinedInput-root": {
      paddingTop: "3.8px !important",
      paddingBottom: "3.8px !important",
    },
    "& ::placeholder": {
      fontSize: 13,
    },
  };

  const capabilitiesSlotProps = {
    paper: {
      sx: {
        "& .MuiAutocomplete-listbox": {
          "& .MuiAutocomplete-option": {
            fontSize: 13,
            fontWeight: 400,
            color: "#1c2130",
            paddingLeft: "9px",
            paddingRight: "9px",
          },
          "& .MuiAutocomplete-option.Mui-focused": {
            background: "background.accent",
          },
        },
        "& .MuiAutocomplete-noOptions": {
          fontSize: 13,
          fontWeight: 400,
          paddingLeft: "9px",
          paddingRight: "9px",
        },
      },
    },
  };

  const modelDetailsSection = (
    <Stack spacing={3}>
      {/* First Row: Provider, Model, Version */}
      <Stack direction={"row"} justifyContent={"space-between"} spacing={6}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="provider"
            label="Provider"
            width={220}
            value={values.provider}
            onChange={handleOnTextFieldChange("provider")}
            error={errors.provider}
            isRequired
            sx={fieldStyle}
            placeholder="eg. OpenAI"
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              width: 220,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                mb: 2,
                fontWeight: 450,
                color: theme.palette.text.primary,
              }}
            >
              Model{" "}
              <Typography component="span" color="black">
                *
              </Typography>
            </Typography>
            <Autocomplete
              id="model-input"
              size="small"
              freeSolo
              value={values.model}
              options={modelInventoryList || []}
              getOptionLabel={(option) =>
                typeof option === "string" ? option : option.name
              }
              onChange={(_event, newValue) => {
                // Handle both option object and free text
                if (typeof newValue === "string") {
                  setValues({
                    ...values,
                    model: newValue,
                  });
                } else if (newValue && typeof newValue === "object") {
                  setValues({
                    ...values,
                    model: newValue.name,
                  });
                } else {
                  setValues({ ...values, model: "" });
                }
              }}
              onInputChange={(_event, newInputValue, reason) => {
                if (reason === "input") {
                  setValues({
                    ...values,
                    model: newInputValue,
                  });
                }
              }}
              renderOption={(props, option) => {
                const { key, ...otherProps } = props;
                return (
                  <Box component="li" key={key} {...otherProps}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        color: theme.palette.text.primary,
                      }}
                    >
                      {option.name}
                    </Typography>
                  </Box>
                );
              }}
              popupIcon={<i data-lucide="chevron-downa"></i>}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select or enter model"
                  error={Boolean(errors.model)}
                  helperText={errors.model}
                  variant="outlined"
                  sx={{
                    "& .MuiInputBase-root": {
                      height: 34,
                      minHeight: 34,
                      borderRadius: 2,
                    },
                    "& .MuiInputBase-input": {
                      padding: "0 8px",
                      fontSize: 13,
                    },
                  }}
                />
              )}
              // noOptionsText="No matching models"
              filterOptions={(options, state) => {
                const filtered = options.filter((option) =>
                  option.name
                    .toLowerCase()
                    .includes(state.inputValue.toLowerCase())
                );

                if (filtered.length === 0) {
                  return [];
                }

                return filtered;
              }}
              slotProps={{
                paper: {
                  sx: {
                    "& .MuiAutocomplete-listbox": {
                      "& .MuiAutocomplete-option": {
                        fontSize: 13,
                        color: theme.palette.text.primary,
                        padding: "8px 12px",
                      },
                      "& .MuiAutocomplete-option.Mui-focused": {
                        backgroundColor: theme.palette.background.accent,
                      },
                    },
                  },
                },
              }}
              disabled={isLoadingUsers}
            />
          </Box>
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="version"
            label="Version"
            width={220}
            value={values.version}
            onChange={handleOnTextFieldChange("version")}
            error={errors.version}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., 4.0, 1.5"
          />
        </Suspense>
      </Stack>

      {/* Second Row: Approver, Status, Status Date */}
      <Stack direction={"row"} justifyContent={"space-between"} spacing={6}>
        <SelectComponent
          id="approver"
          label="Approver"
          value={values.approver ?? ""}
          error={errors.approver}
          sx={{ width: 220 }}
          items={userOptions}
          onChange={handleOnSelectChange("approver")}
          placeholder="Select approver"
          disabled={isLoadingUsers}
        />
        <SelectComponent
          items={statusOptions}
          value={values.status}
          error={errors.status}
          sx={{ width: 220 }}
          id="status"
          label="Status"
          isRequired
          onChange={handleOnSelectChange("status")}
          placeholder="Select status"
        />
        <Suspense fallback={<div>Loading...</div>}>
          <DatePicker
            label="Status date"
            date={
              values.status_date ? dayjs(values.status_date) : dayjs(new Date())
            }
            handleDateChange={handleDateChange}
            sx={{
              width: 220,
              backgroundColor: theme.palette.background.main,
            }}
            isRequired
            error={errors.status_date}
          />
        </Suspense>
      </Stack>

      {/* Capabilities Section */}
      <Stack>
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: 500,
            height: "22px",
            mb: theme.spacing(2),
            color: theme.palette.text.secondary,
          }}
        >
          Capabilities
        </Typography>
        <Autocomplete
          multiple
          id="capabilities-input"
          size="small"
          value={values.capabilities}
          options={capabilityOptions}
          onChange={handleCapabilityChange}
          getOptionLabel={(option) => option}
          noOptionsText={
            values.capabilities.length === capabilityOptions.length
              ? "All capabilities selected"
              : "No options"
          }
          renderOption={(props, option) => {
            const { key, ...otherProps } = props;
            return (
              <Box component="li" key={key} {...otherProps}>
                <Typography sx={{ fontSize: 13, fontWeight: 400 }}>
                  {option}
                </Typography>
              </Box>
            );
          }}
          filterSelectedOptions
          popupIcon={<ChevronDown />}
          renderInput={(params) => (
            <TextField
              {...params}
              error={!!errors.capabilities}
              placeholder="Select capabilities"
              sx={capabilitiesRenderInputStyle}
            />
          )}
          sx={{
            ...getAutocompleteStyles(theme, {
              hasError: !!errors.capabilities,
            }),
            backgroundColor: theme.palette.background.main,
            "& .MuiChip-root": {
              borderRadius: "4px",
            },
          }}
          slotProps={capabilitiesSlotProps}
        />
        {errors.capabilities && (
          <Typography
            variant="caption"
            sx={{
              mt: 1,
              color: "#f04438",
              fontWeight: 300,
              fontSize: 11,
            }}
          >
            {errors.capabilities}
          </Typography>
        )}
      </Stack>

      {/* Used in Projects Section */}
      <Stack>
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: 500,
            height: "22px",
            mb: theme.spacing(2),
            color: theme.palette.text.secondary,
          }}
        >
          Used in use cases
        </Typography>
        <Autocomplete
          multiple
          id="projects-input"
          size="small"
          value={
            (values.projects || [])
              .map((id) => projectList.find((p) => p.id === id)?.project_title)
              .filter(Boolean) as string[]
          }
          options={projectsList}
          onChange={handleSelectUsedInProjectChange}
          getOptionLabel={(option) => option}
          noOptionsText={
            (values.projects || []).length === projectsList.length
              ? "All projects selected"
              : "No options"
          }
          renderOption={(props, option) => {
            const { key, ...otherProps } = props;
            return (
              <Box component="li" key={key} {...otherProps}>
                <Typography sx={{ fontSize: 13, fontWeight: 400 }}>
                  {option}
                </Typography>
              </Box>
            );
          }}
          filterSelectedOptions
          popupIcon={<ChevronDown size={16} />}
          renderInput={(params) => (
            <TextField
              {...params}
              error={!!errors.projects}
              placeholder="Select projects"
              sx={capabilitiesRenderInputStyle}
            />
          )}
          sx={{
            ...getAutocompleteStyles(theme, {
              hasError: !!errors.projects,
            }),
            backgroundColor: theme.palette.background.main,
            "& .MuiChip-root": {
              borderRadius: "4px",
            },
          }}
          slotProps={capabilitiesSlotProps}
        />
        {errors.projects && (
          <Typography
            variant="caption"
            sx={{
              mt: 1,
              color: "#f04438",
              fontWeight: 300,
              fontSize: 11,
            }}
          >
            {errors.projects}
          </Typography>
        )}
      </Stack>

      {/* Used in Frameworks Section */}
      <Stack>
        <Typography
          sx={{
            fontSize: "13px",
            fontWeight: 500,
            height: "22px",
            mb: theme.spacing(2),
            color: theme.palette.text.secondary,
          }}
        >
          Used in frameworks
        </Typography>
        <Autocomplete
          multiple
          id="frameworks-input"
          size="small"
          value={
            (values.frameworks || [])
              .map((id) => frameworkIdToNameMap.get(id))
              .filter(Boolean) as string[]
          }
          options={frameworksList}
          onChange={handleSelectUsedInFrameworksChange}
          getOptionLabel={(option) => option}
          noOptionsText={
            (values.frameworks || []).length === frameworksList.length
              ? "All frameworks selected"
              : "No options"
          }
          renderOption={(props, option) => {
            const { key, ...otherProps } = props;
            return (
              <Box component="li" key={key} {...otherProps}>
                <Typography sx={{ fontSize: 13, fontWeight: 400 }}>
                  {option}
                </Typography>
              </Box>
            );
          }}
          filterSelectedOptions
          popupIcon={<ChevronDown size={16} />}
          renderInput={(params) => (
            <TextField
              {...params}
              error={!!errors.frameworks}
              placeholder="Select frameworks"
              sx={capabilitiesRenderInputStyle}
            />
          )}
          sx={{
            ...getAutocompleteStyles(theme, {
              hasError: !!errors.frameworks,
            }),
            backgroundColor: theme.palette.background.main,
            "& .MuiChip-root": {
              borderRadius: "4px",
            },
          }}
          slotProps={capabilitiesSlotProps}
        />
        {errors.frameworks && (
          <Typography
            variant="caption"
            sx={{
              mt: 1,
              color: "#f04438",
              fontWeight: 300,
              fontSize: 11,
            }}
          >
            {errors.frameworks}
          </Typography>
        )}
      </Stack>

      <Stack direction={"row"} spacing={6}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="reference_link"
            label="Reference link"
            width={"50%"}
            value={values.reference_link}
            onChange={handleOnTextFieldChange("reference_link")}
            sx={fieldStyle}
            placeholder="eg. www.org.ca"
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="biases"
            label="Biases"
            width={"50%"}
            value={values.biases}
            onChange={handleOnTextFieldChange("biases")}
            sx={fieldStyle}
            placeholder="Biases"
          />
        </Suspense>
      </Stack>

      <Stack direction={"row"} spacing={6}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="hosting_provider"
            label="Hosting provider"
            value={values.hosting_provider}
            width={"50%"}
            onChange={handleOnTextFieldChange("hosting_provider")}
            sx={fieldStyle}
            placeholder="eg. OpenAI"
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="limitations"
            label="Limitations"
            width={"50%"}
            value={values.limitations}
            onChange={handleOnTextFieldChange("limitations")}
            sx={fieldStyle}
            placeholder="Limitation"
          />
        </Suspense>
      </Stack>

      {/* Security Assessment Section */}
      <Stack>
        <FormControlLabel
          control={
            <Toggle
              checked={values.security_assessment}
              onChange={handleSecurityAssessmentChange}
            />
          }
          label={
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: theme.palette.text.primary,
                }}
              >
                Security assessment is complete for this model
              </Typography>
              {values.security_assessment && (
                <VWLink
                  onClick={() => setIsUploadModalOpen(true)}
                  showIcon={false}
                  sx={{ marginLeft: "8px" }}
                >
                  {values.security_assessment_data &&
                  values.security_assessment_data.length > 0
                    ? "Add more files"
                    : "Upload assessment"}
                </VWLink>
              )}
            </Box>
          }
          sx={{
            marginLeft: 0,
            marginRight: 0,
            "& .MuiFormControlLabel-label": {
              fontSize: 13,
              fontWeight: 400,
              color: theme.palette.text.primary,
            },
          }}
        />
      </Stack>

      {errors.security_assessment_data && (
        <Typography
          variant="caption"
          sx={{
            mt: 1,
            color: "#f04438",
            fontWeight: 300,
            fontSize: 11,
          }}
        >
          {errors.security_assessment_data}
        </Typography>
      )}
      {/* ✅ Upload Section (appears only when toggle is ON) */}
      {values.security_assessment && (
        <Stack spacing={4}>
          {values.security_assessment_data &&
            values.security_assessment_data.length > 0 && (
              <Stack spacing={2}>
                {values.security_assessment_data.map((file, index) => (
                  <Box
                    key={index}
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    p={1.5}
                    border={`1px solid ${theme.palette.grey[300]}`}
                    borderRadius={1}
                  >
                    {/* Left side: file info */}
                    <Box>
                      <Typography variant="body2">
                        <strong>File:</strong> {file.filename}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Size:</strong>{" "}
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </Typography>
                      <Typography variant="body2">
                        <strong>Uploaded:</strong>{" "}
                        {dayjs
                          .utc(file.upload_date)
                          .format("YYYY-MM-DD HH:mm:ss")}
                      </Typography>
                    </Box>

                    {/* Right side: delete icon with tooltip */}
                    <Tooltip title="Remove file" arrow>
                      <IconButton
                        onClick={() => {
                          setValues((prevValues) => ({
                            ...prevValues,
                            security_assessment_data:
                              prevValues.security_assessment_data.filter(
                                (f) => f.id !== file.id
                              ),
                          }));
                        }}
                        edge="end"
                        size="small"
                        sx={{
                          padding: "4px",
                          bgcolor: theme.palette.grey[100],
                          "&:hover": {
                            bgcolor: theme.palette.grey[200],
                          },
                        }}
                      >
                        <DeleteIconGrey size={18} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            )}
        </Stack>
      )}

      <FileManagerUploadModal
        open={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
        modelId={selectedModelInventoryId}
      />
    </Stack>
  );

  const evidenceSection = (
    <Box
      onWheel={(e) => {
        // Stop scroll events from propagating to background
        e.stopPropagation();
      }}
      sx={{ height: "100%", overflow: "auto" }}
    >
      <Stack spacing={3}>
        {/* ------------ ADD NEW EVIDENCE BUTTON ------------ */}
        <Box display="flex" justifyContent="flex-end" sx={{ gap: 4 }}>
          <CustomizableButton
            variant="contained"
            sx={addNewModelButtonStyle}
            text="Add new evidence"
            icon={<AddCircleOutlineIcon size={16} />}
            onClick={() =>
              handleAddEvidence?.(Number(selectedModelInventoryId))
            }
          />

          <CustomizableButton
            variant="contained"
            text="Download"
            sx={{
              backgroundColor: theme.palette.primary.main,
              border: `1px solid ${theme.palette.primary.main}`,
            }}
            startIcon={<DownloadIcon size={16} />}
            onClick={() => handleDownloadEvidence(evidenceData)}
          />
        </Box>

        {/* ------------ EVIDENCE TABLE ------------ */}
        <EvidenceHubTable
          data={evidenceForThisModel}
          isLoading={isEvidenceLoading}
          onEdit={handleEditEvidence}
          onDelete={handleDeleteEvidence}
          paginated={true}
          modelInventoryData={modelInventoryData}
        />
      </Stack>
    </Box>
  );

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? "Edit Model" : "Add a new model"}
      description={
        isEdit
          ? "Update model details, approval status, and metadata"
          : "Register a new AI model with comprehensive metadata and approval tracking"
      }
      onSubmit={activeTab === "details" ? handleSubmit : undefined}
      submitButtonText={isEdit ? "Update model" : "Save"}
      isSubmitting={isButtonDisabled}
      maxWidth="760px"
      expandedHeight={values.security_assessment}
    >
      {/* ----------------- TABS ONLY IN EDIT MODE ----------------- */}
      {isEdit ? (
        <TabContext value={activeTab}>
          {/* TAB BAR */}
          <Box sx={{ marginBottom: 3 }}>
            <TabBar
              tabs={[
                {
                  label: "Model details",
                  value: "details",
                  icon: "Box",
                },
                {
                  label: "Evidence",
                  value: "evidence",
                  icon: "Database",
                },
                {
                  label: "Activity",
                  value: "activity",
                  icon: "History",
                },
              ]}
              activeTab={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              dataJoyrideId="model-tabs"
            />
          </Box>

          {/* Tab Content Wrapper */}
          <Box
            sx={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {activeTab === "details" && modelDetailsSection}
            {activeTab === "evidence" && evidenceSection}
            {activeTab === "activity" && (
              <HistorySidebar
                inline
                isOpen={true}
                entityType="model_inventory"
                entityId={selectedModelInventoryId as number}
              />
            )}
          </Box>
        </TabContext>
      ) : (
        modelDetailsSection
      )}
    </StandardModal>
  );
};

export default NewModelInventory;
