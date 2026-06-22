import {
  SelectChangeEvent,
  Stack,
  Typography,
  useTheme,
  Autocomplete,
  TextField,
  Box,
  Tooltip,
} from "@mui/material";
import { VWLink } from "../../../components/Link";
import { ChevronDown } from "lucide-react";
import React, { useState, useCallback, useMemo, useEffect, useRef, useContext } from "react";
import Field from "../../../components/Inputs/Field";
import DatePicker from "../../../components/Inputs/Datepicker";
import dayjs, { Dayjs } from "dayjs";
import Select from "../../../components/Inputs/Select";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import selectValidation from "../../../../application/validations/selectValidation";
import Alert from "../../../components/Alert";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import {
  assignFrameworkToProject,
  deleteEntityById,
} from "../../../../application/repository/entity.repository";
import { logEngine } from "../../../../application/tools/log.engine";
import { useNavigate, useSearchParams } from "react-router-dom";
import useProjectData from "../../../../application/hooks/useProjectData";
import useUsers from "../../../../application/hooks/useUsers";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Save as SaveIcon, Trash2 as DeleteIcon } from "lucide-react";
import CustomizableToast from "../../../components/Toast";
import CustomizableSkeleton from "../../../components/Skeletons";
import IntakeSubmissionCard from "../IntakeSubmissionCard";
import CustomFieldsSection, {
  type CustomFieldsSectionHandle,
} from "../../../components/CustomFieldsSection";
import { useRequiredCustomFieldsGate } from "../../../components/CustomFieldsSection/RequiredCustomFieldsGate";
import useFrameworks from "../../../../application/hooks/useFrameworks";
import { Framework } from "../../../../domain/types/Framework";
import allowedRoles from "../../../../application/constants/permissions";
import { VerifyWiseContext } from "../../../../application/contexts/VerifyWise.context";
import { User } from "../../../../domain/types/User";
import {
  deleteProject,
  updateProject,
} from "../../../../application/repository/project.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import { AiRiskClassification } from "../../../../domain/enums/aiRiskClassification.enum";
import { HighRiskRole } from "../../../../domain/enums/highRiskRole.enum";
import RiskAnalysisModal from "../RiskAnalysisModal";
import { getAutocompleteStyles } from "../../../utils/inputStyles";
import { useStyles } from "./styles";

const riskClassificationItems = [
  { _id: 1, name: AiRiskClassification.PROHIBITED },
  { _id: 2, name: AiRiskClassification.HIGH_RISK },
  { _id: 3, name: AiRiskClassification.LIMITED_RISK },
  { _id: 4, name: AiRiskClassification.MINIMAL_RISK },
];

const geographyItems = [
  { _id: 1, name: "Global" },
  { _id: 2, name: "Europe" },
  { _id: 3, name: "North America" },
  { _id: 4, name: "South America" },
  { _id: 5, name: "Asia" },
  { _id: 6, name: "Africa" },
];

const highRiskRoleItems = [
  { _id: 1, name: HighRiskRole.DEPLOYER },
  { _id: 2, name: HighRiskRole.PROVIDER },
];

enum ProjectStatusEnum {
  NotStarted = "Not started",
  InProgress = "In progress",
  UnderReview = "Under review",
  Completed = "Completed",
  Closed = "Closed",
  OnHold = "On hold",
  Rejected = "Rejected",
}

const projectStatusItems = [
  { _id: 1, name: ProjectStatusEnum.NotStarted },
  { _id: 2, name: ProjectStatusEnum.InProgress },
  { _id: 3, name: ProjectStatusEnum.UnderReview },
  { _id: 4, name: ProjectStatusEnum.Completed },
  { _id: 5, name: ProjectStatusEnum.Closed },
  { _id: 6, name: ProjectStatusEnum.OnHold },
  { _id: 7, name: ProjectStatusEnum.Rejected },
];

interface FormValues {
  projectTitle: string;
  goal: string;
  status: number;
  owner: number;
  members: number[];
  startDate: string;
  riskClassification: number;
  typeOfHighRiskRole: number;
  geography: number;
  targetIndustry: string;
  description: string;
  monitoredRegulationsAndStandards: {
    _id: number;
    name: string;
    project_framework_id?: number;
    framework_id?: number;
  }[];
}

interface FormErrors {
  projectTitle?: string;
  goal?: string;
  status?: string;
  owner?: string;
  startDate?: string;
  members?: string;
  riskClassification?: string;
  typeOfHighRiskRole?: string;
  monitoredRegulationsAndStandards?: string;
  geography?: string;
  targetIndustry?: string;
  description?: string;
}

const initialState: FormValues = {
  projectTitle: "",
  goal: "",
  status: 1,
  owner: 0,
  members: [],
  startDate: "",
  riskClassification: 0,
  typeOfHighRiskRole: 0,
  geography: 1,
  targetIndustry: "",
  description: "",
  monitoredRegulationsAndStandards: [{ _id: 1, name: "EU AI Act" }],
};

const ProjectSettings = React.memo(
  ({ triggerRefresh = () => {} }: { triggerRefresh?: (isUpdate: boolean) => void }) => {
    const { setProjects } = useContext(VerifyWiseContext);
    const { userRoleName, userId } = useAuth();
    const [searchParams] = useSearchParams();
    const projectId = searchParams.get("projectId") ?? "1"; // default project ID is 2
    const theme = useTheme();
    const styles = useStyles();
    const [isChangeOwnerModalOpen, setIsChangeOwnerModalOpen] = useState(false);
    const [pendingOwnerId, setPendingOwnerId] = useState<User | null>(null);
    const [removedOwner, setRemovedOwner] = useState<User | null>(null);
    const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);

    const { project } = useProjectData({ projectId });
    const navigate = useNavigate();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Check if project has pending approval
    const hasPendingApproval = project && (project as any).has_pending_approval;
    const [isFrameworkRemoveModalOpen, setIsFrameworkRemoveModalOpen] = useState(false);
    const [frameworkToRemove, setFrameworkToRemove] = useState<{
      _id: number;
      name: string;
    } | null>(null);
    const [values, setValues] = useState<FormValues>(initialState);
    const [errors, setErrors] = useState<FormErrors>({});
    const [alert, setAlert] = useState<{
      variant: "success" | "info" | "warning" | "error";
      title?: string;
      body: string;
      isToast: boolean;
      visible: boolean;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isFrameworkOperationInProgress, setIsFrameworkOperationInProgress] = useState(false);
    const [showCustomizableSkeleton, setShowCustomizableSkeleton] = useState<boolean>(false);
    const initialValuesRef = useRef<FormValues>({ ...initialState });
    const customFieldsRef = useRef<CustomFieldsSectionHandle | null>(null);
    const isModified = useMemo(() => {
      if (!initialValuesRef.current.projectTitle) return false;

      // Check all fields except monitoredRegulationsAndStandards
      const basicFieldsModified =
        values.projectTitle !== initialValuesRef.current.projectTitle ||
        values.goal !== initialValuesRef.current.goal ||
        values.status !== initialValuesRef.current.status ||
        values.owner !== initialValuesRef.current.owner ||
        JSON.stringify(values.members) !== JSON.stringify(initialValuesRef.current.members) ||
        values.startDate !== initialValuesRef.current.startDate ||
        values.riskClassification !== initialValuesRef.current.riskClassification ||
        values.typeOfHighRiskRole !== initialValuesRef.current.typeOfHighRiskRole ||
        values.geography !== initialValuesRef.current.geography ||
        values.targetIndustry !== initialValuesRef.current.targetIndustry ||
        values.description !== initialValuesRef.current.description;

      // Only consider framework changes if we're not in the middle of a framework operation
      const frameworksModified =
        !isFrameworkOperationInProgress &&
        JSON.stringify(values.monitoredRegulationsAndStandards) !==
          JSON.stringify(initialValuesRef.current.monitoredRegulationsAndStandards);

      return basicFieldsModified || frameworksModified;
    }, [values, isFrameworkOperationInProgress]);

    const customFieldsGate = useRequiredCustomFieldsGate(
      "project",
      parseInt(projectId, 10) || null,
    );

    const isSaveDisabled = useMemo(() => {
      if (showCustomizableSkeleton) return true;
      if (isFrameworkOperationInProgress) return true;
      if (!isModified) return true;
      if (customFieldsGate.blocked) return true;

      const hasErrors = Object.values(errors).some((error) => error && error.length > 0);

      return hasErrors;
    }, [
      isModified,
      errors,
      showCustomizableSkeleton,
      isFrameworkOperationInProgress,
      customFieldsGate.blocked,
    ]);

    const [removedFramework, setRemovedFramework] = useState<boolean>(false);

    useEffect(() => {
      if (project) {
        initialState.projectTitle = project?.project_title ?? "";
        setValues(initialState);
      }
    }, [project]);

    const { users } = useUsers();

    const { filteredFrameworks: monitoredFrameworks, allFrameworks } = useFrameworks({
      listOfFrameworks: project?.framework || [],
    });

    // Filter frameworks to only show non-organizational ones
    const nonOrganizationalFrameworks = useMemo(
      () => allFrameworks.filter((fw: Framework) => !fw.is_organizational),
      [allFrameworks],
    );
    useEffect(() => {
      setShowCustomizableSkeleton(true);
      if (project) {
        const frameworksForProject =
          monitoredFrameworks.length > 0
            ? monitoredFrameworks.map((fw: Framework) => {
                const projectFramework = project.framework?.find(
                  (pf) => Number(pf.framework_id) === Number(fw.id),
                );
                return {
                  _id: Number(fw.id),
                  name: fw.name,
                  project_framework_id: projectFramework?.project_framework_id || Number(fw.id),
                  framework_id: Number(fw.id),
                };
              })
            : [];

        const returnedData: FormValues = {
          ...initialState,
          projectTitle: project.project_title ?? "",
          goal: project.goal ?? "",
          status:
            projectStatusItems.find(
              (item) => item.name.toLowerCase() === (project.status || "Not started").toLowerCase(),
            )?._id || 1,
          owner: project.owner ?? 0,
          startDate: project.start_date ? dayjs(project.start_date).toISOString() : "",
          members: project.members ? project.members.map(Number) : [],
          riskClassification:
            riskClassificationItems.find(
              (item) =>
                item.name.toLowerCase() === (project.ai_risk_classification || "").toLowerCase(),
            )?._id || 0,
          typeOfHighRiskRole:
            highRiskRoleItems.find(
              (item) =>
                item.name.toLowerCase() === (project.type_of_high_risk_role || "").toLowerCase(),
            )?._id || 0,
          geography: project.geography ?? 1,
          targetIndustry: project.target_industry ?? "",
          description: project.description ?? "",
          monitoredRegulationsAndStandards: frameworksForProject,
        };
        initialValuesRef.current = returnedData;
        setShowCustomizableSkeleton(false);
        setValues(returnedData);
      }
    }, [project, monitoredFrameworks]);

    const handleDateChange = useCallback((newDate: Dayjs | null) => {
      if (newDate?.isValid()) {
        setValues((prevValues) => ({
          ...prevValues,
          startDate: newDate ? newDate.toISOString() : "",
        }));
      }
    }, []);

    const handleOnSelectChange = useCallback(
      (prop: keyof FormValues) => (event: SelectChangeEvent<string | number>) => {
        const selectedValue = Number(event.target.value);

        if (prop === "owner") {
          if (values.members.includes(selectedValue)) {
            let oldOwner = null;
            let newOwnerId = null;
            for (const user of users) {
              if (user.id === selectedValue) {
                newOwnerId = user;
              }
              if (user.id === values.owner) {
                oldOwner = user;
              }
            }
            setRemovedOwner(oldOwner);
            setPendingOwnerId(newOwnerId);
            setIsChangeOwnerModalOpen(true);
            return;
          }
        }
        setValues({ ...values, [prop]: selectedValue });
        setErrors((prevErrors) => ({ ...prevErrors, [prop]: "" }));
      },
      [users, values],
    );

    const handleOwnershipChangeAcknowledge = () => {
      if (!pendingOwnerId) return;
      setValues((prevValues) => ({
        ...prevValues,
        owner: pendingOwnerId.id,
        members: values.members.filter((member) => member !== pendingOwnerId.id),
      }));
      setErrors((prevErrors) => ({ ...prevErrors, owner: "" }));
      setIsChangeOwnerModalOpen(false);
      setPendingOwnerId(null);
      setRemovedOwner(null);
    };

    const handleCloseOwnerChangeDialog = useCallback((): void => {
      setIsChangeOwnerModalOpen(false);
    }, []);

    const handleOnTextFieldChange = useCallback(
      (prop: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
        setValues((prevValues) => ({
          ...prevValues,
          [prop]: event.target.value,
        }));
        setErrors((prevErrors) => ({ ...prevErrors, [prop]: "" }));
      },
      [],
    );

    const handleOnMultiSelect = useCallback(
      (prop: keyof FormValues) => async (_event: React.SyntheticEvent, newValue: any[]) => {
        if (prop === "monitoredRegulationsAndStandards") {
          // If removing a framework (newValue has fewer items than current value)
          if (newValue.length < values.monitoredRegulationsAndStandards.length) {
            const removedFramework = values.monitoredRegulationsAndStandards.find(
              (fw) => !newValue.some((nv) => nv._id === fw._id),
            );
            setRemovedFramework(prop === "monitoredRegulationsAndStandards");
            if (removedFramework) {
              setIsFrameworkOperationInProgress(true);
              setFrameworkToRemove(removedFramework);
              setIsFrameworkRemoveModalOpen(values.monitoredRegulationsAndStandards.length > 1);
              // Don't update values state yet
              return;
            }
          }
          // If adding a framework
          else if (newValue.length > values.monitoredRegulationsAndStandards.length) {
            const addedFramework = newValue.find(
              (nv) => !values.monitoredRegulationsAndStandards.some((fw) => fw._id === nv._id),
            );

            if (addedFramework) {
              setIsFrameworkOperationInProgress(true);
              setIsLoading(true);
              try {
                const response = await assignFrameworkToProject({
                  frameworkId: addedFramework._id,
                  projectId: projectId,
                });

                if (response.status === 200 || response.status === 201) {
                  // Update local state only after successful API call
                  setValues((prevValues) => ({
                    ...prevValues,
                    [prop]: newValue,
                  }));
                  // Update initialValuesRef to prevent isModified from becoming true
                  initialValuesRef.current = {
                    ...initialValuesRef.current,
                    [prop]: newValue,
                  };

                  setAlert({
                    variant: "success",
                    body: "Framework added successfully",
                    isToast: true,
                    visible: true,
                  });

                  // Trigger refresh after successful framework addition
                  triggerRefresh(true);
                } else {
                  setAlert({
                    variant: "error",
                    body: "Failed to add framework. Please try again.",
                    isToast: true,
                    visible: true,
                  });
                  return;
                }
              } catch (_error) {
                logEngine({
                  type: "error",
                  message: "An error occurred while adding the framework.",
                });
                setAlert({
                  variant: "error",
                  body: "An unexpected error occurred. Please try again.",
                  isToast: true,
                  visible: true,
                });
                return;
              } finally {
                setIsLoading(false);
                setIsFrameworkOperationInProgress(false);
                setTimeout(() => {
                  setAlert(null);
                }, 3000);
              }
            }
          }
          // If no change in length (e.g., reordering), just update the state
          else {
            setValues((prevValues) => ({
              ...prevValues,
              [prop]: newValue,
            }));
            // Update initialValuesRef to prevent isModified from becoming true
            initialValuesRef.current = {
              ...initialValuesRef.current,
              [prop]: newValue,
            };
          }
        } else {
          setValues((prevValues) => ({
            ...prevValues,
            [prop]: newValue.map((user) => user.id),
          }));
          setErrors((prevErrors) => ({ ...prevErrors, [prop]: "" }));
        }
      },
      [values.monitoredRegulationsAndStandards, projectId, triggerRefresh],
    );

    const handleFrameworkRemoveConfirm = useCallback(async () => {
      if (!frameworkToRemove) return;

      setIsLoading(true);
      try {
        const response = await deleteEntityById({
          routeUrl: `/frameworks/fromProject?frameworkId=${frameworkToRemove._id}&projectId=${projectId}`,
        });

        if (response.status === 200) {
          const newFrameworks = values.monitoredRegulationsAndStandards.filter(
            (fw) => fw._id !== frameworkToRemove._id,
          );

          // Update both values and initialValuesRef
          setValues((prevValues) => ({
            ...prevValues,
            monitoredRegulationsAndStandards: newFrameworks,
          }));
          initialValuesRef.current = {
            ...initialValuesRef.current,
            monitoredRegulationsAndStandards: newFrameworks,
          };

          setAlert({
            variant: "success",
            body: "Framework removed successfully",
            isToast: true,
            visible: true,
          });

          // Trigger refresh after successful framework removal
          triggerRefresh(true);
        } else if (response.status === 404) {
          setAlert({
            variant: "error",
            body: "Framework not found or could not be removed from the project",
            isToast: true,
            visible: true,
          });
        } else {
          setAlert({
            variant: "error",
            body: "Failed to remove framework. Please try again.",
            isToast: true,
            visible: true,
          });
        }
      } catch (_error) {
        logEngine({
          type: "error",
          message: "An error occurred while removing the framework.",
        });
        setAlert({
          variant: "error",
          body: "An unexpected error occurred. Please try again.",
          isToast: true,
          visible: true,
        });
      } finally {
        setIsLoading(false);
        setIsFrameworkOperationInProgress(false);
        setIsFrameworkRemoveModalOpen(false);
        setFrameworkToRemove(null);
        setRemovedFramework(false);
        setTimeout(() => {
          setAlert(null);
        }, 3000);
      }
    }, [frameworkToRemove, projectId, values.monitoredRegulationsAndStandards, triggerRefresh]);

    const handleFrameworkRemoveCancel = useCallback(() => {
      setIsFrameworkRemoveModalOpen(false);
      setFrameworkToRemove(null);
      setIsFrameworkOperationInProgress(false);
      setRemovedFramework(false);
    }, []);

    const validateForm = useCallback((): boolean => {
      const newErrors: FormErrors = {};

      const projectTitle = checkStringValidation("Use case title", values.projectTitle, 1, 64);
      if (!projectTitle.accepted) {
        newErrors.projectTitle = projectTitle.message;
      }
      const goal = checkStringValidation("Goal", values.goal, 1, 256);
      if (!goal.accepted) {
        newErrors.goal = goal.message;
      }
      const status = selectValidation("Use case status", values.status);
      if (!status.accepted) {
        newErrors.status = status.message;
      }
      const startDate = checkStringValidation("Start date", values.startDate, 1);
      if (!startDate.accepted) {
        newErrors.startDate = startDate.message;
      }

      const owner = selectValidation("Owner", values.owner);
      if (!owner.accepted) {
        newErrors.owner = owner.message;
      }

      // Skip framework validation if use-case has pending approval (no frameworks created yet)
      if (!hasPendingApproval) {
        const monitoredRegulationsAndStandards = selectValidation(
          "Applicable regulations",
          values.monitoredRegulationsAndStandards.length,
        );
        if (!monitoredRegulationsAndStandards.accepted) {
          newErrors.monitoredRegulationsAndStandards = monitoredRegulationsAndStandards.message;
        }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }, [values, hasPendingApproval]);

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (validateForm()) {
        handleSaveConfirm();
      } else {
        setAlert({
          variant: "error",
          body: "Form validation fails.",
          isToast: true,
          visible: true,
        });
        setTimeout(() => {
          setAlert(null);
        }, 1500);
      }
    }

    const fieldStyle = useMemo(
      () => ({
        "backgroundColor": theme.palette.background.main,
        "& input": {
          padding: "0 14px",
        },
      }),
      [theme.palette.background.main],
    );

    const handleOpenDeleteDialog = useCallback((): void => {
      setIsDeleteModalOpen(true);
    }, []);

    const handleCloseDeleteDialog = useCallback((): void => {
      setIsDeleteModalOpen(false);
    }, []);
    // saves the project
    const handleSaveConfirm = useCallback(async () => {
      const selectedRiskClass =
        riskClassificationItems.find((item) => item._id === values.riskClassification)?.name || "";
      const selectedHighRiskRole =
        highRiskRoleItems.find((item) => item._id === values.typeOfHighRiskRole)?.name || "";
      const selectedStatus =
        projectStatusItems.find((item) => item._id === values.status)?.name || "";
      const selectedRegulations = values.monitoredRegulationsAndStandards.map((reg) => reg.name);

      const selectedGeography =
        geographyItems.find((item) => item._id === values.geography)?._id || "";

      await updateProject({
        id: Number(projectId),
        body: {
          id: projectId,
          project_title: values.projectTitle,
          owner: values.owner,
          members: values.members.map(String),
          start_date: values.startDate,
          ai_risk_classification: selectedRiskClass,
          type_of_high_risk_role: selectedHighRiskRole,
          goal: values.goal,
          geography: selectedGeography,
          target_industry: values.targetIndustry,
          description: values.description,
          status: selectedStatus,
          monitored_regulations_and_standards: selectedRegulations,
          last_updated: new Date().toISOString(),
          last_updated_by: userId,
          framework: values.monitoredRegulationsAndStandards.map((fw) => ({
            project_framework_id: fw._id,
            framework_id: fw._id,
          })),
        },
      }).then(async (response) => {
        if (response.status === 202) {
          // Create new values reference and update both ref and form state
          const newValues = { ...values };
          initialValuesRef.current = newValues;
          setValues(newValues);

          let cfFlushFailed = false;
          const pid = Number(projectId);
          if (Number.isFinite(pid) && pid > 0 && customFieldsRef.current?.hasPendingValues()) {
            try {
              await customFieldsRef.current.flush(pid);
            } catch (cfError) {
              cfFlushFailed = true;
              console.error("Project saved, but custom field values failed to save:", cfError);
            }
          }
          if (cfFlushFailed) {
            setIsLoading(false);
            return;
          }

          setAlert({
            variant: "success",
            body: "Project updated successfully",
            isToast: true,
            visible: true,
          });
          setTimeout(() => {
            setIsLoading(false);
            setAlert(null);
          }, 2000);
          // setRefreshKey((prevKey) => prevKey + 1);
          triggerRefresh(true);
        } else if (response.status === 400) {
          setIsLoading(false);
          setAlert({
            variant: "error",
            body: response.data.data.message,
            isToast: true,
            visible: true,
          });
        }
      });
    }, [values, projectId]);

    const handleConfirmDelete = useCallback(async () => {
      setIsLoading(true);
      try {
        const response = await deleteProject({
          id: Number(projectId),
        });
        const isError = response.status === 404 || response.status === 500;
        setAlert({
          variant: isError ? "error" : "success",
          title: isError ? "Error" : "Success",
          body: isError
            ? "Failed to delete project. Please try again."
            : "Project deleted successfully.",
          isToast: true,
          visible: true,
        });
        if (!isError) {
          setProjects((prevProjects) =>
            prevProjects.filter((project) => project.id !== Number(projectId)),
          );
          navigate("/overview");
          setTimeout(() => {
            setAlert(null);
          }, 3000);
        } else {
          setTimeout(() => {
            setAlert(null);
          }, 3000);
        }
      } catch (_error) {
        logEngine({
          type: "error",
          message: "An error occured while deleting the project.",
        });
        setAlert({
          variant: "error",
          title: "Error",
          body: "Failed to delete project. Please try again.",
          isToast: true,
          visible: true,
        });
      } finally {
        setIsDeleteModalOpen(false);
        setIsLoading(false);
      }
    }, [navigate, projectId]);

    return (
      <Stack>
        {isLoading && <CustomizableToast />}
        {alert && (
          <Alert
            variant={alert.variant}
            title={alert.title}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
          />
        )}
        {showCustomizableSkeleton ? (
          <CustomizableSkeleton variant="rectangular" width="50%" height={200} />
        ) : (
          <Box sx={styles.root}>
            <Stack component="form" onSubmit={handleSubmit} rowGap="15px">
              {/* Use Case Overview Card */}
              <Box sx={styles.card}>
                <Typography sx={styles.sectionTitle}>Use Case Overview</Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr",
                    rowGap: "25px",
                    columnGap: "250px",
                    alignItems: "center",
                    mt: 2,
                  }}
                >
                  {/* Use case title Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Use case title</Typography>
                    <Typography sx={{ fontSize: 12, color: "#888", mt: 0.5 }}>
                      A concise name for your AI use case
                    </Typography>
                  </Box>
                  <Field
                    id="project-title-input"
                    label=""
                    width={400}
                    value={values.projectTitle}
                    onChange={handleOnTextFieldChange("projectTitle")}
                    sx={fieldStyle}
                    error={errors.projectTitle}
                    isRequired
                  />

                  {/* Description Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Description</Typography>
                    <Typography sx={{ fontSize: 12, color: "#888", mt: 0.5 }}>
                      Overview of this use case
                    </Typography>
                  </Box>
                  <Field
                    id="description-input"
                    label=""
                    width={400}
                    type="description"
                    value={values.description}
                    onChange={handleOnTextFieldChange("description")}
                    sx={{
                      backgroundColor: theme.palette.background.main,
                    }}
                    error={errors.description}
                  />

                  {/* Goal Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Goal</Typography>
                    <Typography sx={{ fontSize: 12, color: "#888", mt: 0.5 }}>
                      What you aim to achieve
                    </Typography>
                  </Box>
                  <Field
                    id="goal-input"
                    label=""
                    width={400}
                    type="description"
                    value={values.goal}
                    onChange={handleOnTextFieldChange("goal")}
                    sx={{
                      backgroundColor: theme.palette.background.main,
                    }}
                    error={errors.goal}
                    isRequired
                  />

                  {/* Target industry Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Target industry</Typography>
                    <Typography sx={{ fontSize: 12, color: "#888", mt: 0.5 }}>
                      Industry sector for this use case
                    </Typography>
                  </Box>
                  <Field
                    id="target-industry-input"
                    label=""
                    width={400}
                    type="description"
                    value={values.targetIndustry}
                    onChange={handleOnTextFieldChange("targetIndustry")}
                    sx={{
                      backgroundColor: theme.palette.background.main,
                    }}
                    error={errors.targetIndustry}
                  />
                </Box>
              </Box>

              {/* Project Details Card */}
              <Box sx={styles.card}>
                <Typography sx={styles.sectionTitle}>Project Details</Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr",
                    rowGap: "25px",
                    columnGap: "250px",
                    alignItems: "center",
                    mt: 2,
                  }}
                >
                  {/* Owner Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Owner</Typography>
                  </Box>
                  <Select
                    id="owner"
                    label=""
                    value={values.owner || ""}
                    onChange={handleOnSelectChange("owner")}
                    items={
                      users?.map((user) => ({
                        _id: user.id,
                        name: `${user.name} ${user.surname}`,
                        email: user.email,
                      })) || []
                    }
                    sx={{
                      width: 400,
                      backgroundColor: theme.palette.background.main,
                    }}
                    error={errors.owner}
                    isRequired
                  />
                  {isChangeOwnerModalOpen && (
                    <ConfirmationModal
                      title="Confirm owner change"
                      body={
                        <Typography fontSize={13}>
                          You setting ownership from{" "}
                          <strong>
                            {removedOwner?.name} {removedOwner?.surname}
                          </strong>{" "}
                          to{" "}
                          <strong>
                            {pendingOwnerId?.name} {pendingOwnerId?.surname}
                          </strong>
                          . We will remove{" "}
                          <strong>
                            {pendingOwnerId?.name} {pendingOwnerId?.surname}
                          </strong>{" "}
                          from the members list.
                        </Typography>
                      }
                      cancelText="Cancel"
                      proceedText="I understand"
                      onCancel={handleCloseOwnerChangeDialog}
                      onProceed={handleOwnershipChangeAcknowledge}
                      proceedButtonColor="primary"
                      proceedButtonVariant="contained"
                      TitleFontSize={0}
                    />
                  )}

                  {/* Start date Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Start date</Typography>
                  </Box>
                  <DatePicker
                    label=""
                    date={values.startDate ? dayjs(values.startDate) : null}
                    handleDateChange={handleDateChange}
                    sx={{ width: "130px" }}
                    isRequired
                    error={errors.startDate}
                  />

                  {/* Geography Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Geography</Typography>
                  </Box>
                  <Select
                    id="geography-type-input"
                    label=""
                    value={values.geography}
                    onChange={handleOnSelectChange("geography")}
                    items={geographyItems}
                    sx={{ width: "150px", backgroundColor: theme.palette.background.main }}
                  />

                  {/* Use case status Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Use case status</Typography>
                    <Typography sx={{ fontSize: 12, color: "#888", mt: 0.5 }}>
                      Development stage of this use case
                    </Typography>
                  </Box>
                  <Select
                    id="project-status"
                    label=""
                    value={values.status || 1}
                    onChange={handleOnSelectChange("status")}
                    items={projectStatusItems}
                    sx={{
                      width: 400,
                      backgroundColor: theme.palette.background.main,
                    }}
                    error={errors.status}
                    isRequired
                  />
                </Box>
              </Box>

              {/* Team & Compliance Card */}
              <Box sx={styles.card}>
                <Typography sx={styles.sectionTitle}>Team & Compliance</Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr",
                    rowGap: "25px",
                    columnGap: "250px",
                    alignItems: "center",
                    mt: 2,
                  }}
                >
                  {/* Only render the monitored regulations and standards section if frameworks are loaded */}
                  {monitoredFrameworks.length > 0 && (
                    <>
                      {/* Applicable regulations Row */}
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                          Applicable regulations *
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                          Add all monitored regulations and standards of the use case.
                        </Typography>
                      </Box>
                      <Stack>
                        <Tooltip
                          title={
                            hasPendingApproval
                              ? "This field is unavailable because the use case has a pending approval request. You can view Overview and edit other Settings."
                              : ""
                          }
                          arrow
                          placement="top"
                          PopperProps={{
                            modifiers: [
                              {
                                name: "offset",
                                options: {
                                  offset: [0, 8],
                                },
                              },
                            ],
                          }}
                          slotProps={{
                            tooltip: {
                              sx: {
                                maxWidth: "280px",
                                fontSize: "12px !important",
                                padding: "6px 10px !important",
                                lineHeight: "1.3 !important",
                              },
                            },
                            arrow: {
                              sx: {
                                fontSize: "12px",
                              },
                            },
                          }}
                        >
                          <span style={{ width: "400px" }}>
                            <Autocomplete
                              multiple
                              disabled={hasPendingApproval}
                              id="monitored-regulations-and-standards-input"
                              size="small"
                              value={values.monitoredRegulationsAndStandards}
                              options={nonOrganizationalFrameworks.map((fw: Framework) => ({
                                _id: Number(fw.id),
                                name: fw.name,
                              }))}
                              onChange={handleOnMultiSelect("monitoredRegulationsAndStandards")}
                              getOptionLabel={(item: { _id: number; name: string }) => item.name}
                              noOptionsText={
                                values.monitoredRegulationsAndStandards.length ===
                                nonOrganizationalFrameworks.length
                                  ? "All regulations selected"
                                  : "No options"
                              }
                              renderOption={(props: any, option: { _id: number; name: string }) => {
                                const isComingSoon = option.name.includes("coming soon");
                                return (
                                  <Box
                                    component="li"
                                    {...props}
                                    sx={{
                                      "opacity": isComingSoon ? 0.5 : 1,
                                      "cursor": isComingSoon ? "not-allowed" : "pointer",
                                      "&:hover": {
                                        backgroundColor: isComingSoon ? "transparent" : undefined,
                                      },
                                    }}
                                  >
                                    <Typography
                                      sx={{
                                        fontSize: "13px",
                                        color: isComingSoon ? "text.secondary" : "text.primary",
                                      }}
                                    >
                                      {option.name}
                                    </Typography>
                                  </Box>
                                );
                              }}
                              isOptionEqualToValue={(
                                option: { _id: number },
                                value: { _id: number },
                              ) => option._id === value._id}
                              getOptionDisabled={(option: { name: string }) =>
                                option.name.includes("coming soon")
                              }
                              filterSelectedOptions
                              popupIcon={
                                <ChevronDown size={16} color={theme.palette.text.tertiary} />
                              }
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  placeholder="Select regulations and standards"
                                  sx={{
                                    "& .MuiOutlinedInput-root": {
                                      height: "34px",
                                      padding: "0 10px",
                                      display: "flex",
                                      alignItems: "center",
                                    },
                                    "& .MuiInputBase-root": {
                                      height: "34px !important",
                                      padding: "0 10px !important",
                                      display: "flex !important",
                                      alignItems: "center !important",
                                      justifyContent: "flex-start !important",
                                    },
                                    "& .MuiInputBase-input": {
                                      padding: "0 !important",
                                      margin: "0 !important",
                                      fontSize: "13px",
                                      lineHeight: "1 !important",
                                    },
                                    "& ::placeholder": {
                                      fontSize: "13px",
                                    },
                                  }}
                                />
                              )}
                              sx={{
                                ...getAutocompleteStyles(theme, {
                                  hasError: !!errors.monitoredRegulationsAndStandards,
                                }),
                                "width": "400px",
                                "backgroundColor": theme.palette.background.main,
                                ".MuiAutocomplete-clearIndicator": {
                                  display: "none",
                                },
                                "& .MuiOutlinedInput-root": {
                                  ...getAutocompleteStyles(theme, {
                                    hasError: !!errors.monitoredRegulationsAndStandards,
                                  })["& .MuiOutlinedInput-root"],
                                  borderRadius: "4px",
                                },
                                "& .MuiChip-root": {
                                  "borderRadius": "4px",
                                  "& .MuiChip-deleteIcon": {
                                    display:
                                      values.monitoredRegulationsAndStandards.length === 1
                                        ? "none"
                                        : "flex",
                                  },
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
                          </span>
                        </Tooltip>
                        {removedFramework &&
                          values.monitoredRegulationsAndStandards.length === 1 && (
                            <Typography
                              variant="caption"
                              sx={{ color: "warning.main", fontWeight: 300, mt: 1 }}
                            >
                              Framework cannot be empty.
                            </Typography>
                          )}
                      </Stack>
                    </>
                  )}

                  {/* Team members Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Team members</Typography>
                    <Typography sx={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                      Add all team members of the use case.
                      <br />
                      Only those who are added will be able to see the use case.
                    </Typography>
                  </Box>
                  <Autocomplete
                    multiple
                    readOnly={!allowedRoles.projects.editTeamMembers.includes(userRoleName)}
                    id="users-input"
                    size="small"
                    value={users.filter((user) => values.members.includes(Number(user.id)))}
                    options={
                      users
                        ?.filter(
                          (user) =>
                            user.id !== values.owner && !values.members.includes(Number(user.id)),
                        )
                        .map((user) => ({
                          id: user.id,
                          name: user.name,
                          surname: user.surname,
                          email: user.email,
                        })) || []
                    }
                    getOptionLabel={(member) => `${member.name} ${member.surname}`}
                    renderOption={(props, option) => {
                      const { key, ...optionProps } = props;
                      const userEmail =
                        option.email.length > 30 ? `${option.email.slice(0, 30)}...` : option.email;
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
                      values.members.length === users.length ? "All members selected" : "No options"
                    }
                    onChange={handleOnMultiSelect("members")}
                    popupIcon={<ChevronDown size={16} color={theme.palette.text.tertiary} />}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Select users"
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            height: "34px",
                            padding: "0 10px",
                            display: "flex",
                            alignItems: "center",
                          },
                          "& .MuiInputBase-root": {
                            height: "34px !important",
                            padding: "0 10px !important",
                            display: "flex !important",
                            alignItems: "center !important",
                            justifyContent: "flex-start !important",
                          },
                          "& .MuiInputBase-input": {
                            padding: "0 !important",
                            margin: "0 !important",
                            fontSize: "13px",
                            lineHeight: "1 !important",
                          },
                          "& ::placeholder": {
                            fontSize: "13px",
                          },
                        }}
                      />
                    )}
                    sx={{
                      ...getAutocompleteStyles(theme, { hasError: !!errors.members }),
                      "width": "400px",
                      "backgroundColor": theme.palette.background.main,
                      "& .MuiOutlinedInput-root": {
                        ...getAutocompleteStyles(theme, { hasError: !!errors.members })[
                          "& .MuiOutlinedInput-root"
                        ],
                        borderRadius: "4px",
                      },
                      "& .MuiChip-root": {
                        borderRadius: "4px",
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

                  {/* AI risk classification Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                      AI risk classification
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                      Not sure about your risk level?&nbsp;
                      <VWLink onClick={() => setIsRiskModalOpen(true)}>
                        Calculate your AI risk classification
                      </VWLink>
                    </Typography>
                  </Box>
                  <Stack gap={1}>
                    <Select
                      id="risk-classification-input"
                      label=""
                      value={values?.riskClassification || 1}
                      onChange={handleOnSelectChange("riskClassification")}
                      items={riskClassificationItems}
                      sx={{
                        width: 400,
                        backgroundColor: theme.palette.background.main,
                      }}
                      error={errors.riskClassification}
                    />
                  </Stack>

                  {/* Type of high risk role Row */}
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                      Type of high risk role
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                      If you are not sure about the high risk role,&nbsp;
                      <VWLink
                        url="https://artificialintelligenceact.eu/high-level-summary/"
                        openInNewTab={true}
                      >
                        please see this link
                      </VWLink>
                    </Typography>
                  </Box>
                  <Select
                    id="risk-classification-input"
                    label=""
                    value={values?.typeOfHighRiskRole || 1}
                    onChange={handleOnSelectChange("typeOfHighRiskRole")}
                    items={highRiskRoleItems}
                    sx={{
                      width: 400,
                      backgroundColor: theme.palette.background.main,
                    }}
                    error={errors.typeOfHighRiskRole}
                  />
                </Box>
              </Box>

              {/* Intake Form Submission */}
              <IntakeSubmissionCard projectId={parseInt(projectId, 10) || 0} />

              {/* Custom Fields */}
              <Box sx={styles.card}>
                <CustomFieldsSection
                  ref={customFieldsRef}
                  entityType="project"
                  entityId={parseInt(projectId, 10) || null}
                />
              </Box>

              {/* Save Button Row */}
              <Stack sx={{ width: "100%" }}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                  <CustomizableButton
                    sx={{
                      ...styles.saveButton,
                      backgroundColor: isSaveDisabled ? "#ccc" : "brand.primary",
                      border: isSaveDisabled
                        ? "1px solid rgba(0, 0, 0, 0.26)"
                        : "1px solid brand.primary",
                    }}
                    icon={<SaveIcon size={16} />}
                    variant="contained"
                    onClick={(event: any) => {
                      handleSubmit(event);
                    }}
                    isDisabled={isSaveDisabled}
                    text="Save"
                  />
                </Box>

                {/* divider for seperation */}
                <Box sx={{ mt: 6, borderTop: "1px solid #E0E0E0", pt: 8, width: "100%" }} />
                <Typography
                  sx={{
                    fontSize: theme.typography.fontSize,
                    fontWeight: 600,
                    mb: 4,
                  }}
                >
                  Delete use case
                </Typography>
                <Typography
                  sx={{
                    fontSize: theme.typography.fontSize,
                    color: "text.icon",
                    mb: 8,
                  }}
                >
                  Note that deleting a use case will remove all data related to that use case from
                  your system. This is permanent and non-recoverable.
                </Typography>
                <CustomizableButton
                  sx={{
                    width: { xs: "100%", sm: theme.spacing(80) },
                    mb: theme.spacing(4),
                    backgroundColor: "#DB504A",
                    color: "background.main",
                    border: "1px solid #DB504A",
                    gap: 2,
                  }}
                  icon={<DeleteIcon size={16} />}
                  variant="contained"
                  onClick={handleOpenDeleteDialog}
                  text="Delete use case"
                  isDisabled={!allowedRoles.projects.delete.includes(userRoleName)}
                />
              </Stack>
            </Stack>
          </Box>
        )}

        {isDeleteModalOpen && (
          <ConfirmationModal
            title="Confirm delete"
            body={
              <Typography fontSize={13}>Are you sure you want to delete the use case?</Typography>
            }
            cancelText="Cancel"
            proceedText="Delete"
            onCancel={handleCloseDeleteDialog}
            onProceed={handleConfirmDelete}
            proceedButtonColor="error"
            proceedButtonVariant="contained"
            TitleFontSize={0}
          />
        )}

        {isFrameworkRemoveModalOpen && (
          <ConfirmationModal
            title="Confirm framework removal"
            body={
              <Typography fontSize={13}>
                Are you sure you want to remove {frameworkToRemove?.name} from the use case?
              </Typography>
            }
            cancelText="Cancel"
            proceedText="Remove"
            onCancel={handleFrameworkRemoveCancel}
            onProceed={handleFrameworkRemoveConfirm}
            proceedButtonColor="error"
            proceedButtonVariant="contained"
            TitleFontSize={0}
          />
        )}

        {/* EU AI Act Risk Analysis Modal */}
        <RiskAnalysisModal
          isOpen={isRiskModalOpen}
          setIsOpen={setIsRiskModalOpen}
          projectId={projectId}
          setAlert={setAlert}
          updateClassification={(classification: string) => {
            const match = riskClassificationItems.find((item) => item.name === classification);
            if (!match) {
              console.error(`Unknown classification: ${classification}`);
              return;
            }
            setValues({
              ...values,
              riskClassification: match._id,
            });
          }}
        />
      </Stack>
    );
  },
);

export default ProjectSettings;
