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
} from "@mui/material";
import { TabContext } from "@mui/lab";
import Toggle from "../../Inputs/Toggle";
import { lazy } from "react";
const Field = lazy(() => import("../../Inputs/Field"));
const DatePicker = lazy(() => import("../../Inputs/Datepicker"));
import SelectComponent from "../../Inputs/Select";
import { ChevronDown } from "lucide-react";
import StandardModal from "../StandardModal";
import TabBar from "../../TabBar";
import { HistorySidebar } from "../../Common/HistorySidebar";
import {
  DatasetStatus,
  DatasetType,
  DataClassification,
} from "../../../../domain/enums/dataset.enum";
import {
  NewDatasetFormValues,
  NewDatasetProps,
} from "../../../../domain/interfaces/i.dataset";
import dayjs, { Dayjs } from "dayjs";
import { useModalKeyHandling } from "../../../../application/hooks/useModalKeyHandling";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import { useProjects } from "../../../../application/hooks/useProjects";
import { Project } from "../../../../domain/types/Project";
import { getAutocompleteStyles } from "../../../utils/inputStyles";

const initialState: NewDatasetFormValues = {
  name: "",
  description: "",
  version: "",
  owner: "",
  type: DatasetType.TRAINING,
  function: "",
  source: "",
  license: "",
  format: "",
  classification: DataClassification.INTERNAL,
  contains_pii: false,
  pii_types: "",
  status: DatasetStatus.DRAFT,
  status_date: new Date().toISOString().split("T")[0],
  known_biases: "",
  bias_mitigation: "",
  collection_method: "",
  preprocessing_steps: "",
  models: [],
  projects: [],
};

const statusOptions = [
  { _id: DatasetStatus.DRAFT, name: "Draft" },
  { _id: DatasetStatus.ACTIVE, name: "Active" },
  { _id: DatasetStatus.DEPRECATED, name: "Deprecated" },
  { _id: DatasetStatus.ARCHIVED, name: "Archived" },
];

const typeOptions = [
  { _id: DatasetType.TRAINING, name: "Training" },
  { _id: DatasetType.VALIDATION, name: "Validation" },
  { _id: DatasetType.TESTING, name: "Testing" },
  { _id: DatasetType.PRODUCTION, name: "Production" },
  { _id: DatasetType.REFERENCE, name: "Reference" },
];

const classificationOptions = [
  { _id: DataClassification.PUBLIC, name: "Public" },
  { _id: DataClassification.INTERNAL, name: "Internal" },
  { _id: DataClassification.CONFIDENTIAL, name: "Confidential" },
  { _id: DataClassification.RESTRICTED, name: "Restricted" },
];

const NewDataset: FC<NewDatasetProps> = ({
  isOpen,
  setIsOpen,
  onSuccess,
  onError,
  initialData,
  isEdit = false,
  modelInventoryData = [],
  entityId,
}) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState("details");
  const [values, setValues] = useState<NewDatasetFormValues>(
    initialData || initialState
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validators = useMemo(
    () => ({
      name: (v: unknown) => {
        const r = checkStringValidation("Name", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      description: (v: unknown) => {
        const r = checkStringValidation("Description", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      version: (v: unknown) => {
        const r = checkStringValidation("Version", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      owner: (v: unknown) => {
        const r = checkStringValidation("Owner", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      type: (v: unknown) => (!v ? "Type is required." : ""),
      function: (v: unknown) => {
        const r = checkStringValidation("Function", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      source: (v: unknown) => {
        const r = checkStringValidation("Source", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      classification: (v: unknown) => (!v ? "Classification is required." : ""),
      status: (v: unknown) => (!v ? "Status is required." : ""),
      status_date: (v: unknown) => {
        const r = checkStringValidation("Status date", v as string, 1);
        return r.accepted ? "" : r.message;
      },
    }),
    []
  );

  const { errors, validateAll, clearFieldError, resetErrors } =
    useFormValidation<NewDatasetFormValues>(validators);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const normalizedData = {
          ...initialData,
          models: Array.isArray(initialData.models)
            ? [...initialData.models]
            : [],
          projects: Array.isArray(initialData.projects)
            ? [...initialData.projects]
            : [],
        };
        setValues(normalizedData);
      } else {
        setValues(initialState);
      }
      resetErrors();
      setIsSubmitting(false);
      setActiveTab("details");
    } else {
      setValues(initialState);
      resetErrors();
      setIsSubmitting(false);
      setActiveTab("details");
    }
  }, [isOpen, initialData, isEdit, resetErrors]);

  const { approvedProjects } = useProjects();

  const projectList = useMemo(() => {
    return Array.isArray(approvedProjects)
      ? approvedProjects.filter((project: Project) => !project.is_organizational)
      : [];
  }, [approvedProjects]);

  const projectsList = useMemo(() => {
    return projectList.map((project: Project) => project.project_title.trim());
  }, [projectList]);

  const modelsList = useMemo(() => {
    return modelInventoryData.map((model) => ({
      id: model.id,
      name: `${model.provider} - ${model.model}`,
    }));
  }, [modelInventoryData]);

  const isButtonDisabled = isSubmitting;

  const handleOnTextFieldChange = useCallback(
    (prop: keyof NewDatasetFormValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setValues((prev) => ({ ...prev, [prop]: value }));
        clearFieldError(prop);
      },
    [clearFieldError]
  );

  const handleOnSelectChange = useCallback(
    (prop: keyof NewDatasetFormValues) => (event: any) => {
      const value = event.target.value;
      setValues((prev) => ({ ...prev, [prop]: value }));
      clearFieldError(prop);
    },
    [clearFieldError]
  );

  const handleSelectModelsChange = useCallback(
    (_event: React.SyntheticEvent, newValue: { id: number | undefined; name: string }[]) => {
      const modelIds = newValue.map((m) => m.id).filter((id): id is number => id !== undefined);
      setValues((prev) => ({ ...prev, models: modelIds }));
    },
    []
  );

  const handleSelectProjectsChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string[]) => {
      const projectIds = newValue
        .map((title) => projectList.find((p) => p.project_title === title)?.id)
        .filter((id): id is number => id !== undefined);
      setValues((prev) => ({ ...prev, projects: projectIds }));
    },
    [projectList]
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

  const handleContainsPiiChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({
        ...prev,
        contains_pii: event.target.checked,
        pii_types: event.target.checked ? prev.pii_types : "",
      }));
    },
    []
  );

  const handleClose = () => {
    setActiveTab("details");
    setIsOpen(false);
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
          await onSuccess(values);
        }
        handleClose();
      } catch (error: any) {
        setIsSubmitting(false);
        if (onError) {
          onError(error);
        }
      }
    }
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

  const autocompleteRenderInputStyle = {
    "& .MuiOutlinedInput-root": {
      paddingTop: "3.8px !important",
      paddingBottom: "3.8px !important",
    },
    "& ::placeholder": {
      fontSize: 13,
    },
  };

  const autocompleteSlotProps = useMemo(
    () => ({
      paper: {
        sx: {
          "& .MuiAutocomplete-listbox": {
            "& .MuiAutocomplete-option": {
              fontSize: 13,
              fontWeight: 400,
              color: theme.palette.text.primary,
              paddingLeft: "9px",
              paddingRight: "9px",
            },
            "& .MuiAutocomplete-option.Mui-focused": {
              background: theme.palette.background.fill,
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
    }),
    [theme.palette.text.primary, theme.palette.background.fill]
  );

  const formContent = (
    <Stack spacing={3}>
      {/* First Row: Name, Version */}
      <Stack direction={"row"} justifyContent={"space-between"} spacing={6}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="name"
            label="Dataset name"
            width={"50%"}
            value={values.name}
            onChange={handleOnTextFieldChange("name")}
            error={errors.name}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., Customer transaction data"
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="version"
            label="Version"
            width={"50%"}
            value={values.version}
            onChange={handleOnTextFieldChange("version")}
            error={errors.version}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., 1.0.0"
          />
        </Suspense>
      </Stack>

      {/* Description */}
      <Suspense fallback={<div>Loading...</div>}>
        <Field
          id="description"
          label="Description"
          type="description"
          width={"100%"}
          value={values.description}
          onChange={handleOnTextFieldChange("description")}
          error={errors.description}
          isRequired
          sx={fieldStyle}
          placeholder="Describe the dataset and its purpose"
          rows={2}
        />
      </Suspense>

      {/* Second Row: Type, Classification, Status */}
      <Stack direction={"row"} justifyContent={"space-between"} spacing={6}>
        <SelectComponent
          id="type"
          label="Type"
          value={values.type}
          error={errors.type}
          isRequired
          sx={{ width: "33%" }}
          items={typeOptions}
          onChange={handleOnSelectChange("type")}
          placeholder="Select type"
        />
        <SelectComponent
          id="classification"
          label="Classification"
          value={values.classification}
          error={errors.classification}
          isRequired
          sx={{ width: "33%" }}
          items={classificationOptions}
          onChange={handleOnSelectChange("classification")}
          placeholder="Select classification"
        />
        <SelectComponent
          items={statusOptions}
          value={values.status}
          error={errors.status}
          sx={{ width: "33%" }}
          id="status"
          label="Status"
          isRequired
          onChange={handleOnSelectChange("status")}
          placeholder="Select status"
        />
      </Stack>

      {/* Third Row: Owner, Status Date, Source */}
      <Stack direction={"row"} justifyContent={"space-between"} spacing={6}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="owner"
            label="Owner"
            width={"33%"}
            value={values.owner}
            onChange={handleOnTextFieldChange("owner")}
            error={errors.owner}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., Data Science Team"
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <DatePicker
            label="Status date"
            date={
              values.status_date ? dayjs(values.status_date) : dayjs(new Date())
            }
            handleDateChange={handleDateChange}
            sx={{
              width: "33%",
              backgroundColor: theme.palette.background.main,
            }}
            isRequired
            error={errors.status_date}
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="source"
            label="Source"
            width={"33%"}
            value={values.source}
            onChange={handleOnTextFieldChange("source")}
            error={errors.source}
            isRequired
            sx={fieldStyle}
            placeholder="e.g., Internal CRM"
          />
        </Suspense>
      </Stack>

      {/* Function */}
      <Suspense fallback={<div>Loading...</div>}>
        <Field
          id="function"
          label="Function"
          width={"100%"}
          value={values.function}
          onChange={handleOnTextFieldChange("function")}
          error={errors.function}
          isRequired
          sx={fieldStyle}
          placeholder="Describe the dataset's function in AI model development"
        />
      </Suspense>

      {/* Fourth Row: License, Format */}
      <Stack direction={"row"} justifyContent={"space-between"} spacing={6}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="license"
            label="License"
            width={"50%"}
            value={values.license}
            onChange={handleOnTextFieldChange("license")}
            sx={fieldStyle}
            placeholder="e.g., CC BY 4.0, MIT"
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="format"
            label="Format"
            width={"50%"}
            value={values.format}
            onChange={handleOnTextFieldChange("format")}
            sx={fieldStyle}
            placeholder="e.g., CSV, JSON, Parquet"
          />
        </Suspense>
      </Stack>

      {/* PII Section */}
      <Stack>
        <FormControlLabel
          control={
            <Toggle
              checked={values.contains_pii}
              onChange={handleContainsPiiChange}
            />
          }
          label={
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 400,
                color: theme.palette.text.primary,
              }}
            >
              Dataset contains personally identifiable information (PII)
            </Typography>
          }
          sx={{
            marginLeft: 0,
            marginRight: 0,
          }}
        />
      </Stack>

      {values.contains_pii && (
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="pii_types"
            label="PII types"
            width={"100%"}
            value={values.pii_types}
            onChange={handleOnTextFieldChange("pii_types")}
            sx={fieldStyle}
            placeholder="e.g., Names, Email addresses, Phone numbers"
          />
        </Suspense>
      )}

      {/* Biases Section */}
      <Stack direction={"row"} justifyContent={"space-between"} spacing={6}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="known_biases"
            label="Known biases"
            width={"50%"}
            value={values.known_biases}
            onChange={handleOnTextFieldChange("known_biases")}
            sx={fieldStyle}
            placeholder="Document any known biases"
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="bias_mitigation"
            label="Bias mitigation"
            width={"50%"}
            value={values.bias_mitigation}
            onChange={handleOnTextFieldChange("bias_mitigation")}
            sx={fieldStyle}
            placeholder="Describe mitigation strategies"
          />
        </Suspense>
      </Stack>

      {/* Collection and Preprocessing */}
      <Stack direction={"row"} justifyContent={"space-between"} spacing={6}>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="collection_method"
            label="Collection method"
            width={"50%"}
            value={values.collection_method}
            onChange={handleOnTextFieldChange("collection_method")}
            sx={fieldStyle}
            placeholder="e.g., Web scraping, API, Manual"
          />
        </Suspense>
        <Suspense fallback={<div>Loading...</div>}>
          <Field
            id="preprocessing_steps"
            label="Preprocessing steps"
            width={"50%"}
            value={values.preprocessing_steps}
            onChange={handleOnTextFieldChange("preprocessing_steps")}
            sx={fieldStyle}
            placeholder="e.g., Normalization, tokenization"
          />
        </Suspense>
      </Stack>

      {/* Used in Models */}
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
          Used in models
        </Typography>
        <Autocomplete
          multiple
          id="models-input"
          size="small"
          value={modelsList.filter((m) => values.models.includes(m.id as number))}
          options={modelsList}
          onChange={handleSelectModelsChange}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          noOptionsText={
            values.models.length === modelsList.length
              ? "All models selected"
              : "No options"
          }
          renderOption={(props, option) => {
            const { key, ...otherProps } = props;
            return (
              <Box component="li" key={key} {...otherProps}>
                <Typography sx={{ fontSize: 13, fontWeight: 400 }}>
                  {option.name}
                </Typography>
              </Box>
            );
          }}
          filterSelectedOptions
          popupIcon={<ChevronDown size={16} />}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select models"
              sx={autocompleteRenderInputStyle}
            />
          )}
          sx={{
            ...getAutocompleteStyles(theme, { hasError: false }),
            backgroundColor: theme.palette.background.main,
            "& .MuiChip-root": {
              borderRadius: "4px",
            },
          }}
          slotProps={autocompleteSlotProps}
        />
      </Stack>

      {/* Used in Projects */}
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
          onChange={handleSelectProjectsChange}
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
              placeholder="Select projects"
              sx={autocompleteRenderInputStyle}
            />
          )}
          sx={{
            ...getAutocompleteStyles(theme, { hasError: false }),
            backgroundColor: theme.palette.background.main,
            "& .MuiChip-root": {
              borderRadius: "4px",
            },
          }}
          slotProps={autocompleteSlotProps}
        />
      </Stack>
    </Stack>
  );

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? "Edit dataset" : "Add a new dataset"}
      description={
        isEdit
          ? "Update dataset details, classification, and metadata"
          : "Register a new dataset with comprehensive metadata for AI governance"
      }
      onSubmit={activeTab === "details" ? handleSubmit : undefined}
      submitButtonText={isEdit ? "Update dataset" : "Save"}
      isSubmitting={isButtonDisabled}
      maxWidth="760px"
    >
      {isEdit && entityId ? (
        <TabContext value={activeTab}>
          <Box sx={{ marginBottom: 3 }}>
            <TabBar
              tabs={[
                { label: "Details", value: "details", icon: "Database" },
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
              entityType="dataset"
              entityId={entityId}
            />
          )}
        </TabContext>
      ) : (
        formContent
      )}
    </StandardModal>
  );
};

export default NewDataset;
