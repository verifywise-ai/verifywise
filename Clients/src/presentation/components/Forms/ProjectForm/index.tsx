import {
  Alert,
  Autocomplete,
  Box,
  SelectChangeEvent,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { X as ClearIcon } from "lucide-react";
import {
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { PlusCircle as AddCircleOutlineIcon } from "lucide-react";
import Field from "../../../components/Inputs/Field";
import {
  createProjectButtonStyle,
  teamMembersRenderInputStyle,
  teamMembersSlotProps,
  teamMembersSxStyle,
  textfieldStyle,
} from "./style";
import Select from "../../../components/Inputs/Select";
import { getAutocompleteStyles } from "../../../utils/inputStyles";
import useUsers from "../../../../application/hooks/useUsers";
import useFrameworks from "../../../../application/hooks/useFrameworks";
import DatePicker from "../../../components/Inputs/Datepicker";
import dayjs, { Dayjs } from "dayjs";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import selectValidation from "../../../../application/validations/selectValidation";
import CustomizableToast from "../../Toast";
import { ChevronDown as GreyDownArrowIcon } from "lucide-react";
import { extractUserToken } from "../../../../application/tools/extractToken";
import { useSelector } from "react-redux";
import Checkbox from "../../../components/Inputs/Checkbox";
import { Project } from "../../../../domain/types/Project";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import { FrameworkTypeEnum } from "./constants";
import { FormValues } from "./constants";
import { initialState } from "./constants";
import { ProjectFormProps } from "./constants";
import { useFormValidation } from "../../../../application/hooks/useFormValidation";
import {
  createProject,
  updateProject,
} from "../../../../application/repository/project.repository";
import { getAllApprovalWorkflows } from "../../../../application/repository/approvalWorkflow.repository";
import { AiRiskClassification } from "../../../../domain/enums/aiRiskClassification.enum";
import { HighRiskRole } from "../../../../domain/enums/highRiskRole.enum";

const PROJECT_STATUS_ITEMS = [
  { _id: 1, name: "Not started" },
  { _id: 2, name: "In progress" },
  { _id: 3, name: "Under review" },
  { _id: 4, name: "Completed" },
  { _id: 5, name: "Closed" },
  { _id: 6, name: "On hold" },
  { _id: 7, name: "Rejected" },
];

// Helper function to convert status string to _id
const getStatusIdFromName = (statusName: string | undefined): number => {
  if (!statusName) return 1;
  const statusItem = PROJECT_STATUS_ITEMS.find(
    (item) => item.name === statusName
  );
  return statusItem?._id || 1;
};

export const ProjectForm = ({
  sx,
  onClose,
  defaultFrameworkType,
  projectToEdit,
  useStandardModal = false,
  onSubmitRef,
}: ProjectFormProps) => {
  const theme = useTheme();
  const { setProjects } = useContext(VerifyWiseContext);

  // Initialize form values based on whether we're editing or creating
  const [values, setValues] = useState<FormValues>(() => {
    if (projectToEdit) {
      return {
        project_title: projectToEdit.project_title || "",
        owner: projectToEdit.owner || 0,
        members: [], // Will be populated in useEffect when users data is available
        start_date: projectToEdit.start_date || "",
        ai_risk_classification: projectToEdit.ai_risk_classification || 0,
        status: getStatusIdFromName(projectToEdit.status),
        type_of_high_risk_role: projectToEdit.type_of_high_risk_role || 0,
        goal: projectToEdit.goal || "",
        enable_ai_data_insertion:
          projectToEdit.enable_ai_data_insertion || false,
        monitored_regulations_and_standards:
          projectToEdit.monitored_regulations_and_standards || [],
        framework_type: projectToEdit.is_organizational
          ? FrameworkTypeEnum.OrganizationWide
          : FrameworkTypeEnum.ProjectBased,
        geography: projectToEdit.geography || 1,
        target_industry: projectToEdit.target_industry || "",
        description: projectToEdit.description || "",
        approval_workflow_id: projectToEdit.approval_workflow_id || 0,
      };
    }
    return {
      ...initialState,
      framework_type: defaultFrameworkType || null,
    };
  });
const { users } = useUsers();
  const { allFrameworks } = useFrameworks({ listOfFrameworks: [] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvalWorkflows, setApprovalWorkflows] = useState<Array<{ _id: number; name: string }>>([]); 
  const validators = useMemo(
    () => ({
      project_title: (v: unknown, vals: FormValues) => {
        const label =
          vals.framework_type === FrameworkTypeEnum.OrganizationWide
            ? "Framework title"
            : "Use case title";
        const r = checkStringValidation(label, v as string, 1, 64);
        return r.accepted ? "" : r.message;
      },
      goal: (v: unknown) => {
        const r = checkStringValidation("Goal", v as string, 1, 256);
        return r.accepted ? "" : r.message;
      },
      start_date: (v: unknown) => {
        const r = checkStringValidation("Start date", v as string, 1);
        return r.accepted ? "" : r.message;
      },
      owner: (v: unknown) => {
        const r = selectValidation("Owner", v as number);
        return r.accepted ? "" : r.message;
      },
      geography: (v: unknown) => {
        const r = selectValidation("Geography", v as number);
        return r.accepted ? "" : r.message;
      },
      ai_risk_classification: (v: unknown, vals: FormValues) => {
        if (vals.framework_type !== FrameworkTypeEnum.ProjectBased) return "";
        const r = selectValidation("AI risk classification", v as number);
        return r.accepted ? "" : r.message;
      },
      type_of_high_risk_role: (v: unknown, vals: FormValues) => {
        if (vals.framework_type !== FrameworkTypeEnum.ProjectBased) return "";
        const r = selectValidation("Type of high risk role", v as number);
        return r.accepted ? "" : r.message;
      },
      monitored_regulations_and_standards: (v: unknown) => {
        if (projectToEdit) return "";
        const list = v as FormValues["monitored_regulations_and_standards"];
        return list.length === 0 ? "At least one framework is required." : "";
      },
    }),
    [projectToEdit]
  );
  const { errors, validateAll, clearFieldError } =
    useFormValidation<FormValues>(validators);

  // Check if the project has a pending approval request
  // Note: We show an info banner but allow editing basic fields
  // Other tabs (frameworks, risks, etc.) are disabled in the ProjectView component
  const hasPendingApproval = useMemo(() => {
    return !!(projectToEdit && (projectToEdit as any).has_pending_approval);
  }, [projectToEdit]);

  // Transform member IDs to User objects when editing a project
  useEffect(() => {
    if (projectToEdit && users && users.length > 0) {
      const memberUsers =
        projectToEdit.members
          ?.map((memberId: number | string) => {
            const user = users.find((u: any) => u.id === Number(memberId));
            if (user) {
              return {
                _id: String(user.id),
                name: user.name || "",
                surname: user.surname || "",
                email: user.email || "",
              };
            }
            return null;
          })
          .filter(Boolean) || [];

      setValues((prev) => ({
        ...prev,
        members: memberUsers,
      }));
    }
  }, [projectToEdit, users]);

  // Fetch approval workflows filtered by entity type (use_case)
  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const response = await getAllApprovalWorkflows();
        const workflows = response?.data || [];
        // Filter to only show workflows for use_case entity type
        const filteredWorkflows = workflows.filter(
          (w: any) => w.entity_type === 'use_case'
        );
        setApprovalWorkflows(
          filteredWorkflows.map((w: any) => ({
            _id: w.id,
            name: w.workflow_title,
          }))
        );
      } catch (error) {
        console.error("Failed to fetch approval workflows:", error);
        setApprovalWorkflows([]);
      }
    };

    fetchWorkflows();
  }, []);

  // Filter frameworks based on framework type
  const filteredFrameworks = useMemo(() => {
    if (!allFrameworks) return [];

    if (values.framework_type === FrameworkTypeEnum.ProjectBased) {
      // Only show EU AI Act for project-based frameworks
      return allFrameworks
        .filter((fw) => fw.is_organizational === false)
        .map((fw) => ({
          _id: Number(fw.id),
          name: fw.name,
        }));
    } else if (values.framework_type === FrameworkTypeEnum.OrganizationWide) {
      // Only show ISO 42001, ISO 27001, and NIST AI RMF for organization-wide frameworks
      return allFrameworks
        .filter(
          (fw) =>
            // fw.name.toLowerCase().includes("iso 42001") ||
            // fw.name.toLowerCase().includes("iso 27001") ||
            // fw.name.toLowerCase().includes("nist ai rmf")
            fw.is_organizational === true
        )
        .map((fw) => ({
          _id: Number(fw.id),
          name: fw.name,
        }));
    }

    return [];
  }, [allFrameworks, values.framework_type]);
  const authState = useSelector(
    (state: { auth: { authToken: string; userExists: boolean } }) => state.auth
  );

  const riskClassificationItems = useMemo(
    () => [
      { _id: 1, name: AiRiskClassification.PROHIBITED },
      { _id: 2, name: AiRiskClassification.HIGH_RISK },
      { _id: 3, name: AiRiskClassification.LIMITED_RISK },
      { _id: 4, name: AiRiskClassification.MINIMAL_RISK },
    ],
    []
  );

  const highRiskRoleItems = useMemo(
    () => [
      { _id: 1, name: HighRiskRole.DEPLOYER },
      { _id: 2, name: HighRiskRole.PROVIDER },
      { _id: 3, name: HighRiskRole.DISTRIBUTOR },
      { _id: 4, name: HighRiskRole.IMPORTER },
      { _id: 5, name: HighRiskRole.PRODUCT_MANUFACTURER },
      { _id: 6, name: HighRiskRole.AUTHORIZED_REPRESENTATIVE },
    ],
    []
  );

  const geographyItems = useMemo(
    () => [
      { _id: 1, name: "Global" },
      { _id: 2, name: "Europe" },
      { _id: 3, name: "North America" },
      { _id: 4, name: "South America" },
      { _id: 5, name: "Asia" },
      { _id: 6, name: "Africa" },
    ],
    []
  );

  const projectStatusItems = useMemo(() => PROJECT_STATUS_ITEMS, []);

  const handleOnTextFieldChange = useCallback(
    (prop: keyof FormValues) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setValues((prev) => ({ ...prev, [prop]: event.target.value }));
        clearFieldError(prop);
      },
    [clearFieldError]
  );

  const handleOnSelectChange = useCallback(
    (prop: keyof FormValues) => (event: SelectChangeEvent<string | number>) => {
      setValues((prev) => {
        const updated = { ...prev, [prop]: event.target.value };
        if (prop === "owner") {
          updated.members = prev.members.filter(
            (member) => Number(member._id) !== Number(event.target.value)
          );
        }
        return updated;
      });
      clearFieldError(prop);
    },
    [clearFieldError]
  );

  const handleOnMultiSelect = useCallback(
    (prop: keyof FormValues) =>
      (_event: React.SyntheticEvent, newValue: any[]) => {
        setValues((prevValues) => ({
          ...prevValues,
          [prop]: newValue,
        }));
        if (prop !== "members") clearFieldError(prop);
      },
    [clearFieldError]
  );

  const handleDateChange = useCallback((newDate: Dayjs | null) => {
    if (newDate?.isValid()) {
      setValues((prevValues: any) => ({
        ...prevValues,
        start_date: newDate ? newDate.toISOString() : "",
      }));
    }
  }, []);

  const handleCheckboxChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues({ ...values, enable_ai_data_insertion: event.target.checked });
    },
    [values]
  );

  const handleSubmit = useCallback(async () => {
    const userInfo = extractUserToken(authState.authToken);
    const teamMember = values.members.map((user) => String(user._id));

    if (validateAll(values)) {
      setIsSubmitting(true);
      try {
        const body: any = {
          ...values,
          status: projectStatusItems.find((item) => item._id === values.status)?.name,
          last_updated: values.start_date,
          last_updated_by: userInfo?.id,
          members: teamMember,
          enable_ai_data_insertion: values.enable_ai_data_insertion,
        };

        // Add AI-specific fields only for project-based frameworks
        if (values.framework_type === FrameworkTypeEnum.ProjectBased) {
          body.type_of_high_risk_role = highRiskRoleItems.find(
            (item) => item._id === values.type_of_high_risk_role
          )?.name;
          body.ai_risk_classification = riskClassificationItems.find(
            (item) => item._id === values.ai_risk_classification
          )?.name;
        } else {
          // For organization-wide frameworks, set default values
          body.type_of_high_risk_role = null;
          body.ai_risk_classification = null;
          body.is_organizational = true;
        }

        // Set frameworks for both types, but skip when editing
        if (!projectToEdit) {
          body.framework = values.monitored_regulations_and_standards.map(
            (fw) => fw._id
          );
        }

        let res;
        if (projectToEdit) {
          // Update existing project
          res = await updateProject({
            id: projectToEdit.id,
            body,
          });
        } else {
          // Create new project
          res = await createProject({
            body,
          });
        }

        if (res.status === 201 || res.status === 200 || res.status === 202) {
          if (projectToEdit) {
            // Update the project in the projects list
            setProjects((prevProjects: Project[]) =>
              prevProjects.map((project) =>
                project.id === projectToEdit.id
                  ? (res.data.data as Project)
                  : project
              )
            );
          } else {
            // Add new project to the projects list
            setProjects((prevProjects: Project[]) => [
              ...prevProjects,
              res.data.data.project as Project,
            ]);
          }
          setTimeout(() => {
            setIsSubmitting(false);
            onClose();
          }, 1000);
        } else {
          setTimeout(() => {
            setIsSubmitting(false);
          }, 1000);
        }
      } catch (_err) {
        setTimeout(() => {
          setIsSubmitting(false);
        }, 1000);
      }
    }
  }, [
    values,
    projectToEdit,
    authState.authToken,
    validateAll,
    projectStatusItems,
    riskClassificationItems,
    highRiskRoleItems,
    setProjects,
    onClose,
  ]);

  // Expose handleSubmit through ref when useStandardModal is true
  useEffect(() => {
    if (useStandardModal && onSubmitRef) {
      onSubmitRef.current = handleSubmit;
    }
  }, [useStandardModal, onSubmitRef, handleSubmit]);

  const renderForm = () => (
    <Stack
      {...(!useStandardModal && { component: "form" })}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      sx={{
        width: useStandardModal ? "100%" : "fit-content",
        backgroundColor: useStandardModal ? "transparent" : theme.palette.background.alt,
        padding: useStandardModal ? 0 : 10,
        borderRadius: "4px",
        gap: useStandardModal ? 6 : 8,
        ...sx,
        maxWidth: useStandardModal ? "100%" : "760px",
      }}
    >
      {isSubmitting && (
        <Stack
          sx={{
            width: "100vw",
            height: "100%",
            position: "fixed",
            top: "0",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
          }}
        >
          <CustomizableToast
            title={
              projectToEdit
                ? (values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Updating framework. Please wait..." : "Updating use case. Please wait...")
                : (values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Creating framework. Please wait..." : "Creating use case. Please wait...")
            }
          />
        </Stack>
      )}

      {!useStandardModal && (
        <Stack
          className="vwproject-form-header"
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Stack className="vwproject-form-header-text">
            <Typography
              sx={{ fontSize: 16, color: theme.palette.text.secondary, fontWeight: "bold" }}
            >
              {projectToEdit
                ? (values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Edit framework" : "Edit use case")
                : (values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Create new framework" : "Create new use case")
              }
            </Typography>
            <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
              {projectToEdit
                ? (values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Update your framework details below" : "Update your use case details below")
                : values.framework_type === FrameworkTypeEnum.ProjectBased
                ? "Create a new use case from scratch by filling in the following."
                : "Set up ISO 27001 or 42001 (Organization ISMS)"}
            </Typography>
          </Stack>
          <ClearIcon
            size={20}
            style={{ color: theme.palette.text.accent, cursor: "pointer" }}
            onClick={onClose}
          />
        </Stack>
      )}

      {hasPendingApproval && (
        <Alert severity="info" sx={{ width: "100%" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
            This use case has a pending approval request. You can view the Overview and edit Settings, but other tabs (Frameworks/Regulations, Use case risks, Linked models, etc.) are disabled until the approval is complete.
          </Typography>
        </Alert>
      )}

      <Stack
        className="vwproject-form-body"
        sx={{ display: "flex", flexDirection: "row", gap: 6 }}
      >
        <Stack className="vwproject-form-body-start" sx={{ gap: 6, flex: 1 }}>
          <Field
            id="project-title-input"
            label={values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Framework title" : "Use case title"}
            width="100%"
            value={values.project_title}
            onChange={handleOnTextFieldChange("project_title")}
            error={errors.project_title}
            sx={textfieldStyle}
            isRequired
          />
          <Select
            id="owner-input"
            label="Owner"
            placeholder="Select owner"
            value={values.owner || ""}
            onChange={handleOnSelectChange("owner")}
            items={
              users?.map((user: any) => ({
                _id: user.id,
                name: `${user.name} ${user.surname}`,
                email: user.email,
              })) || []
            }
            sx={{
              width: "100%",
              backgroundColor: theme.palette.background.main,
            }}
            error={errors.owner}
            isRequired
          />
          <Select
            id="project-status-input"
            label={values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Framework status" : "Use case status"}
            placeholder="Select status"
            value={values.status || ""}
            onChange={handleOnSelectChange("status")}
            items={projectStatusItems}
            sx={{
              width: "100%",
              backgroundColor: theme.palette.background.main,
            }}
            error={errors.status}
          />
          {values.framework_type === FrameworkTypeEnum.ProjectBased && (
            <Select
              id="approval-workflow-input"
              label="Approval workflow"
              placeholder="Select workflow"
              value={values.approval_workflow_id || ""}
              onChange={handleOnSelectChange("approval_workflow_id")}
              items={approvalWorkflows}
              sx={{
                width: "100%",
                backgroundColor: theme.palette.background.main,
              }}
              error={errors.approval_workflow_id}
            />
          )}
          {values.framework_type === FrameworkTypeEnum.ProjectBased && (
            <>
              <Select
                id="risk-classification-input"
                label="AI risk classification"
                placeholder="Select an option"
                value={values.ai_risk_classification || ""}
                onChange={handleOnSelectChange("ai_risk_classification")}
                items={riskClassificationItems}
                sx={{
                  width: "100%",
                  backgroundColor: theme.palette.background.main,
                }}
                error={errors.ai_risk_classification}
                isRequired
              />
              <Select
                id="type-of-high-risk-role-input"
                label="Type of high risk role"
                placeholder="Select an option"
                value={values.type_of_high_risk_role || ""}
                onChange={handleOnSelectChange("type_of_high_risk_role")}
                items={highRiskRoleItems}
                sx={{
                  width: "100%",
                  backgroundColor: theme.palette.background.main,
                }}
                isRequired
                error={errors.type_of_high_risk_role}
              />
            </>
          )}
        </Stack>
        <Stack className="vwproject-form-body-end" sx={{ gap: 6, flex: 1 }}>
          <Suspense fallback={<div>Loading...</div>}>
            <Stack gap={theme.spacing(2)}>
              <Typography
                component="p"
                variant="body1"
                color={theme.palette.text.secondary}
                fontWeight={500}
                fontSize={"13px"}
                sx={{
                  margin: 0,
                  height: '22px',
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Team members
              </Typography>
              <Autocomplete
                multiple
                id="users-input"
                size="small"
                value={values.members.map((user) => ({
                  _id: Number(user._id),
                  name: user.name,
                  surname: user.surname,
                  email: user.email,
                }))}
                options={
                  users
                    ?.filter(
                      (user) =>
                        !values.members.some(
                          (selectedUser) =>
                            String(selectedUser._id) === String(user.id)
                        ) && values.owner !== user.id
                    )
                    .map((user) => ({
                      _id: user.id,
                      name: user.name,
                      surname: user.surname,
                      email: user.email,
                    })) || []
                }
                noOptionsText={
                  values.members.length === users.length
                    ? "All members selected"
                    : "No options"
                }
                onChange={handleOnMultiSelect("members")}
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
                          color: theme.palette.text.accent,
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
                    error={!!errors.members}
                    sx={teamMembersRenderInputStyle}
                  />
                )}
                sx={{
                  backgroundColor: theme.palette.background.main,
                  cursor: "pointer",
                  ...getAutocompleteStyles(theme, { hasError: !!errors.members }),
                  ...teamMembersSxStyle,
                  "& .MuiOutlinedInput-root": {
                    ...getAutocompleteStyles(theme, { hasError: !!errors.members })["& .MuiOutlinedInput-root"],
                    "& fieldset": {
                      ...getAutocompleteStyles(theme, { hasError: !!errors.members })["& .MuiOutlinedInput-root"]["& fieldset"],
                      borderRadius: "3px",
                    },
                  },
                }}
                slotProps={teamMembersSlotProps}
              />
            </Stack>
            <Stack sx={{ display: "flex", flexDirection: "row", gap: 6, width: "100%" }}>
              <Box sx={{ flex: 1 }}>
                <DatePicker
                  label="Start date"
                  date={
                    values.start_date ? dayjs(values.start_date) : dayjs(new Date())
                  }
                  handleDateChange={handleDateChange}
                  sx={{
                    width: "100%",
                  }}
                  isRequired
                  error={errors.start_date}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Select
                  id="geography-type-input"
                  label="Geography"
                  placeholder="Select an option"
                  value={
                    values.geography === 0
                      ? ""
                      : values.geography
                  }
                  onChange={handleOnSelectChange("geography")}
                  items={geographyItems}
                  sx={{
                    width: "100%",
                    backgroundColor: theme.palette.background.main,
                  }}
                  isRequired
                  error={errors.geography}
                />
              </Box>
            </Stack>
            {!projectToEdit &&
              values.framework_type !== FrameworkTypeEnum.OrganizationWide && (
                <Stack>
                  <Typography
                    sx={{
                      fontSize: theme.typography.fontSize,
                      fontWeight: 500,
                      mb: 2,
                    }}
                  >
                    Applicable regulations *
                  </Typography>
                  <Autocomplete
                    multiple
                    id="monitored-regulations-and-standards-input"
                    size="small"
                    value={values.monitored_regulations_and_standards}
                    options={filteredFrameworks}
                    onChange={handleOnMultiSelect(
                      "monitored_regulations_and_standards"
                    )}
                    getOptionLabel={(item) => item.name}
                    noOptionsText={
                      values.monitored_regulations_and_standards.length ===
                      filteredFrameworks.length
                        ? "All regulations selected"
                        : "No options"
                    }
                    renderOption={(props, option) => {
                      const { key, ...optionProps } = props;
                      const isComingSoon = option.name.includes("coming soon");
                      return (
                        <Box
                          key={key}
                          component="li"
                          {...optionProps}
                          sx={{
                            opacity: isComingSoon ? 0.5 : 1,
                            cursor: isComingSoon ? "not-allowed" : "pointer",
                            "&:hover": {
                              backgroundColor: isComingSoon
                                ? "transparent"
                                : undefined,
                            },
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: "13px",
                              color: isComingSoon
                                ? "text.secondary"
                                : "text.primary",
                            }}
                          >
                            {option.name}
                          </Typography>
                        </Box>
                      );
                    }}
                    isOptionEqualToValue={(option, value) =>
                      option._id === value._id
                    }
                    getOptionDisabled={(option) =>
                      option.name.includes("coming soon")
                    }
                    filterSelectedOptions
                    popupIcon={<GreyDownArrowIcon size={16} />}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        error={!!errors.monitored_regulations_and_standards}
                        placeholder="Select regulations and standards"
                        sx={teamMembersRenderInputStyle}
                      />
                    )}
                    sx={{
                      backgroundColor: theme.palette.background.main,
                      ...teamMembersSxStyle,
                    }}
                    slotProps={teamMembersSlotProps}
                  />
                  {!!errors.monitored_regulations_and_standards && (
                    <Typography
                      variant="caption"
                      sx={{ mt: 4, color: theme.palette.status.error.text, fontWeight: 300 }}
                    >
                      {errors.monitored_regulations_and_standards}
                    </Typography>
                  )}
                </Stack>
              )}
          </Suspense>
          {/* Goal field - only for project-based frameworks */}
          {values.framework_type === FrameworkTypeEnum.ProjectBased && (
            <Field
              id="goal-input"
              label="Goal"
              type="description"
              value={values.goal}
              onChange={handleOnTextFieldChange("goal")}
              sx={{
                backgroundColor: theme.palette.background.main,
                marginTop: "1px",
                ...(projectToEdit && { width: "350px" }), // Fix width when editing
              }}
              rows={8}
              isRequired
              error={errors.goal}
            />
          )}
        </Stack>
      </Stack>

      {/* Goal field - full width only for organization-wide frameworks */}
      {values.framework_type === FrameworkTypeEnum.OrganizationWide && (
        <Stack>
          {!projectToEdit && (
            <Stack sx={{ mb: 2 }}>
              <Typography
                sx={{
                  fontSize: theme.typography.fontSize,
                  fontWeight: 500,
                  mb: 2,
                }}
              >
                Applicable regulations *
              </Typography>
              <Autocomplete
                multiple
                id="monitored-regulations-and-standards-input"
                size="small"
                value={values.monitored_regulations_and_standards}
                options={filteredFrameworks}
                onChange={handleOnMultiSelect(
                  "monitored_regulations_and_standards"
                )}
                getOptionLabel={(item) => item.name}
                noOptionsText={
                  values.monitored_regulations_and_standards.length ===
                  filteredFrameworks.length
                    ? "All regulations selected"
                    : "No options"
                }
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  const isComingSoon = option.name.includes("coming soon");
                  return (
                    <Box
                      key={key}
                      component="li"
                      {...optionProps}
                      sx={{
                        opacity: isComingSoon ? 0.5 : 1,
                        cursor: isComingSoon ? "not-allowed" : "pointer",
                        "&:hover": {
                          backgroundColor: isComingSoon
                            ? "transparent"
                            : undefined,
                        },
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "13px",
                          color: isComingSoon
                            ? "text.secondary"
                            : "text.primary",
                        }}
                      >
                        {option.name}
                      </Typography>
                    </Box>
                  );
                }}
                isOptionEqualToValue={(option, value) =>
                  option._id === value._id
                }
                getOptionDisabled={(option) =>
                  option.name.includes("coming soon")
                }
                filterSelectedOptions
                popupIcon={<GreyDownArrowIcon size={16} />}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    error={!!errors.monitored_regulations_and_standards}
                    placeholder="Select regulations and standards"
                    sx={teamMembersRenderInputStyle}
                  />
                )}
                sx={{
                  backgroundColor: theme.palette.background.main,
                  ...teamMembersSxStyle,
                  width: "100%",
                }}
                slotProps={teamMembersSlotProps}
              />
              {!!errors.monitored_regulations_and_standards && (
                <Typography
                  variant="caption"
                  sx={{ mt: 4, color: theme.palette.status.error.text, fontWeight: 300 }}
                >
                  {errors.monitored_regulations_and_standards}
                </Typography>
              )}
            </Stack>
          )}
          <Field
            id="goal-input"
            label="Goal"
            type="description"
            value={values.goal}
            onChange={handleOnTextFieldChange("goal")}
            sx={{
              backgroundColor: theme.palette.background.main,
              width: "100%",
            }}
            isRequired
            error={errors.goal}
          />
        </Stack>
      )}
      {!projectToEdit &&
        values.framework_type === FrameworkTypeEnum.ProjectBased && (
          <Stack>
            <Stack sx={{ display: "flex", flexDirection: "row", gap: 6, mb: 4 }}>
            <Field
              id="target-industry-input"
              label="Target industry"
              type="description"
              value={values.target_industry}
              onChange={handleOnTextFieldChange("target_industry")}
              sx={{
                flex: 1,
                backgroundColor: theme.palette.background.main,
              }}
              error={errors.target_industry}
            />
            <Field
              id="description-input"
              label="Description"
              type="description"
              value={values.description}
              onChange={handleOnTextFieldChange("description")}
              sx={{
                flex: 1,
                backgroundColor: theme.palette.background.main,
              }}
              error={errors.description}
            />
            </Stack>
            <Checkbox
              size="small"
              id="auto-fill"
              onChange={handleCheckboxChange}
              isChecked={values.enable_ai_data_insertion}
              value={values.enable_ai_data_insertion.toString()}
              label="Enable this option to automatically fill in the Controls and Assessment questions with AI-generated answers, helping you save time. You can review and edit these answers anytime."
            />
          </Stack>
        )}
      {!useStandardModal && (
        <Stack
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <CustomizableButton
            text={projectToEdit
              ? (values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Update framework" : "Update use case")
              : (values.framework_type === FrameworkTypeEnum.OrganizationWide ? "Create framework" : "Create use case")
            }
            sx={createProjectButtonStyle}
            icon={<AddCircleOutlineIcon size={20} />}
            onClick={() => handleSubmit()}
          />
        </Stack>
      )}
    </Stack>
  );

  return renderForm();
};

