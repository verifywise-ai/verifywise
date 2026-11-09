import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { ArrowLeft, Ban, Download, ListChecks, Upload } from "lucide-react";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { SearchBox } from "../../../components/Search";
import Select from "../../../components/Inputs/Select";
import Checkbox from "../../../components/Inputs/Checkbox";
import Alert from "../../../components/Alert";
import CustomizableSkeleton from "../../../components/Skeletons";
import StandardModal from "../../../components/Modals/StandardModal";
import { EmptyState } from "../../../components/EmptyState";
import { CustomizableButton } from "../../../components/button/customizable-button";
import BulkActionsToolbar, { type BulkAction } from "../../../components/Table/BulkActionsToolbar";
import { useBulkSelection } from "../../../../application/hooks/useBulkSelection";
import { useCanEditAiApps } from "../../../../application/hooks/useCanEditAiApps";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import {
  useAiAppAssessments,
  useAiAppQuestionnaires,
  useCancelAiAppAssessments,
  useDownloadAiAppAssessmentWorksheet,
} from "../../../../application/hooks/useAiAppBulk";
import { fill } from "../../../../i18n/fill";
import type {
  AiAppAssessmentStatus,
  IAiAppAssessment,
} from "../../../../domain/interfaces/i.aiAppBulk";
import { saveBlob } from "../bulkUtils";
import {
  controlButtonSx,
  controlSearchSx,
  controlSelectSx,
  filterRowStyle,
  mainStackStyle,
  toolbarStyle,
} from "../style";
import { AssessmentAnswers, questionsFor } from "./AssessmentDisplay";
import AssessmentAnswerModal from "./AssessmentAnswerModal";
import AssessmentsTable from "./AssessmentsTable";
import QuestionnaireManagerModal from "./QuestionnaireManagerModal";
import WorksheetUploadModal from "./WorksheetUploadModal";

type StatusFilter = AiAppAssessmentStatus | "all";
type QuestionnaireFilter = number | "all";

const STATUS_OPTIONS: Array<{ _id: StatusFilter; name: string }> = [
  { _id: "all", name: "All statuses" },
  { _id: "pending", name: "Pending" },
  { _id: "completed", name: "Completed" },
];

const getAssessmentId = (assessment: IAiAppAssessment) => assessment.id;

export default function AIAppAssessments() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const canEdit = useCanEditAiApps();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL holds this filter, because notification links land on ?assigned=me.
  const assignedToMe = searchParams.get("assigned") === "me";
  const setAssignedToMe = (next: boolean) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("assigned", "me");
        else params.delete("assigned");
        return params;
      },
      { replace: true },
    );

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Null until the user picks one; the effective filter is derived below.
  const [questionnaireChoice, setQuestionnaireChoice] = useState<QuestionnaireFilter | null>(() => {
    const fromUrl = Number(searchParams.get("questionnaire_id"));
    return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : null;
  });
  const { data: questionnaires = [], isLoading: isLoadingQuestionnaires } =
    useAiAppQuestionnaires();

  const questionnaireFilter: QuestionnaireFilter = useMemo(() => {
    if (questionnaireChoice === "all") return "all";
    if (questionnaires.some((q) => q.id === questionnaireChoice)) {
      return questionnaireChoice as number;
    }
    // Someone looking for their own work should see all of it.
    if (questionnaireChoice === null && assignedToMe) return "all";
    return questionnaires.find((q) => q.is_default)?.id ?? "all";
  }, [questionnaireChoice, questionnaires, assignedToMe]);

  const selectedQuestionnaire =
    questionnaireFilter === "all"
      ? undefined
      : questionnaires.find((q) => q.id === questionnaireFilter);

  const [rowsPerPage, setRowsPerPage] = useState(10);
  const filterKey = [statusFilter, questionnaireFilter, debouncedSearch, assignedToMe].join("|");
  const [paging, setPaging] = useState({ key: filterKey, page: 0 });
  const page = paging.key === filterKey ? paging.page : 0;
  const setPage = (next: number) => setPaging({ key: filterKey, page: next });

  const { data, isLoading, error } = useAiAppAssessments(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      questionnaireId: questionnaireFilter === "all" ? undefined : questionnaireFilter,
      search: debouncedSearch || undefined,
      assignedToMe: assignedToMe || undefined,
      page: page + 1,
      limit: rowsPerPage,
    },
    // Wait for the default questionnaire, so the first list is the right one.
    !isLoadingQuestionnaires,
  );
  const assessments = useMemo(() => data?.assessments ?? [], [data]);
  const pendingRows = useMemo(
    () => assessments.filter((assessment) => assessment.status === "pending"),
    [assessments],
  );

  const {
    selectedIds,
    isSelected,
    toggle,
    toggleAll,
    clear: clearSelection,
    allSelected,
    someSelected,
    count,
  } = useBulkSelection<IAiAppAssessment>({ rows: pendingRows, getId: getAssessmentId });

  useEffect(() => {
    clearSelection();
  }, [filterKey, clearSelection]);

  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 3000);
    return () => clearTimeout(timer);
  }, [alert]);

  const [active, setActive] = useState<IAiAppAssessment | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const cancelMutation = useCancelAiAppAssessments();
  const worksheetMutation = useDownloadAiAppAssessmentWorksheet();

  const handleCancel = useCallback(async () => {
    try {
      const { cancelled } = await cancelMutation.mutateAsync(selectedIds);
      clearSelection();
      setAlert({
        variant: "success",
        body:
          cancelled === 1
            ? t("1 assessment cancelled")
            : fill(t("{count} assessments cancelled"), { count: cancelled }),
      });
    } catch {
      setAlert({ variant: "error", body: t("Could not cancel the assessments. Try again.") });
    }
  }, [cancelMutation, selectedIds, clearSelection, t]);

  const handleDownloadWorksheet = async () => {
    if (!selectedQuestionnaire) return;
    try {
      const blob = await worksheetMutation.mutateAsync(selectedQuestionnaire.id);
      saveBlob(blob, "ai-app-assessment-worksheet.xlsx");
    } catch {
      setAlert({ variant: "error", body: t("Could not download the worksheet. Try again.") });
    }
  };

  const bulkActions: BulkAction[] = [
    {
      id: "cancel",
      label: t("Cancel assessments"),
      icon: <Ban size={14} strokeWidth={1.5} />,
      onClick: handleCancel,
      confirm: {
        title: t("Cancel pending assessments"),
        body: (
          <Typography fontSize={13}>
            {count === 1
              ? t("This removes 1 pending assessment. It can't be undone.")
              : fill(t("This removes {count} pending assessments. It can't be undone."), {
                  count,
                })}
          </Typography>
        ),
        confirmLabel: t("Cancel assessments"),
        danger: true,
      },
    },
  ];

  // The next pending row after the open one, on this page.
  const activeIndex = active ? assessments.findIndex((a) => a.id === active.id) : -1;
  const nextPending = active
    ? (activeIndex === -1 ? assessments : assessments.slice(activeIndex + 1)).find(
        (a) => a.status === "pending" && a.can_answer && a.id !== active.id,
      )
    : undefined;

  const worksheetHint = selectedQuestionnaire ? "" : t("Choose a questionnaire first");

  return (
    <PageHeaderExtended
      title="AI app assessments"
      description="Rate AI apps against a questionnaire, one at a time or with a worksheet."
      helpArticlePath="ai-governance/ai-apps"
    >
      <Stack sx={mainStackStyle}>
        <Box>
          <CustomizableButton
            text="AI apps"
            variant="text"
            startIcon={<ArrowLeft size={16} strokeWidth={1.5} />}
            onClick={() => navigate("/ai-apps")}
            testId="ai-app-assessments-back"
            sx={controlButtonSx}
          />
        </Box>
        <Box sx={toolbarStyle}>
          <Box sx={filterRowStyle}>
            <SearchBox
              placeholder="Search AI apps"
              value={searchTerm}
              onChange={setSearchTerm}
              inputProps={{ "data-testid": "ai-app-assessments-search" }}
              sx={{ ...controlSearchSx, width: 220 }}
            />
            <Select
              id="ai-app-assessments-status"
              ariaLabel="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              items={STATUS_OPTIONS}
              dataTestId="ai-app-assessments-status"
              sx={{ ...controlSelectSx, width: 150 }}
            />
            <Select
              id="ai-app-assessments-questionnaire"
              ariaLabel="Questionnaire"
              value={questionnaireFilter}
              onChange={(e) =>
                setQuestionnaireChoice(e.target.value === "all" ? "all" : Number(e.target.value))
              }
              items={[
                { _id: "all", name: "All questionnaires" },
                ...questionnaires.map((q) => ({ _id: q.id, name: q.name })),
              ]}
              disabled={isLoadingQuestionnaires}
              dataTestId="ai-app-assessments-questionnaire"
              sx={{ ...controlSelectSx, width: 200 }}
            />
            <Checkbox
              id="ai-app-assessments-assigned-to-me"
              label="Assigned to me"
              value="assigned-to-me"
              isChecked={assignedToMe}
              onChange={(e) => setAssignedToMe(e.target.checked)}
            />
          </Box>
          <Box sx={filterRowStyle}>
            <Tooltip title={worksheetHint}>
              <span>
                <CustomizableButton
                  text="Download worksheet"
                  variant="outlined"
                  startIcon={<Download size={16} strokeWidth={1.5} />}
                  onClick={handleDownloadWorksheet}
                  disabled={!selectedQuestionnaire}
                  loading={worksheetMutation.isPending}
                  testId="ai-app-assessments-download-worksheet"
                  sx={controlButtonSx}
                />
              </span>
            </Tooltip>
            <Tooltip title={worksheetHint}>
              <span>
                <CustomizableButton
                  text="Upload answers"
                  variant="outlined"
                  startIcon={<Upload size={16} strokeWidth={1.5} />}
                  onClick={() => setIsUploadOpen(true)}
                  disabled={!selectedQuestionnaire}
                  testId="ai-app-assessments-upload-answers"
                  sx={controlButtonSx}
                />
              </span>
            </Tooltip>
            {canEdit && (
              <CustomizableButton
                text="Questionnaires"
                variant="outlined"
                startIcon={<ListChecks size={16} strokeWidth={1.5} />}
                onClick={() => setIsManagerOpen(true)}
                testId="ai-app-assessments-questionnaires"
                sx={controlButtonSx}
              />
            )}
          </Box>
        </Box>

        {isLoading || isLoadingQuestionnaires ? (
          <CustomizableSkeleton variant="rectangular" width="100%" height={400} />
        ) : error ? (
          <EmptyState message="Failed to load assessments. Please try again." showBorder />
        ) : (
          <AssessmentsTable
            assessments={assessments}
            questionnaires={questionnaires}
            total={data?.total ?? 0}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={(next) => {
              setRowsPerPage(next);
              setPage(0);
            }}
            onOpen={setActive}
            selection={
              canEdit
                ? {
                    isSelected,
                    onToggle: toggle,
                    onToggleAll: toggleAll,
                    allSelected,
                    someSelected,
                  }
                : undefined
            }
            emptyMessage={
              assignedToMe
                ? t("No assessments are assigned to you.")
                : canEdit
                  ? t(
                      "No assessments match these filters. Select AI apps on the AI apps page and request one.",
                    )
                  : t("No assessments match these filters.")
            }
          />
        )}

        {canEdit && (
          <BulkActionsToolbar count={count} onClear={clearSelection} actions={bulkActions} />
        )}

        {active?.status === "pending" && (
          <AssessmentAnswerModal
            key={active.id}
            assessment={active}
            questions={questionsFor(active, questionnaires)}
            onClose={() => setActive(null)}
            onSaved={() => setAlert({ variant: "success", body: t("Assessment saved") })}
            onNext={nextPending ? () => setActive(nextPending) : undefined}
          />
        )}

        {active?.status === "completed" && (
          <StandardModal
            isOpen
            onClose={() => setActive(null)}
            title={active.ai_app_name ?? t("Assessment")}
            description="Completed assessments cannot be changed. Request a new one to change the score."
            hideSubmitButton
            cancelButtonText="Close"
          >
            <AssessmentAnswers
              questions={questionsFor(active, questionnaires)}
              answers={active.answers}
            />
          </StandardModal>
        )}

        {isUploadOpen && selectedQuestionnaire && (
          <WorksheetUploadModal
            questionnaire={selectedQuestionnaire}
            onClose={() => setIsUploadOpen(false)}
          />
        )}

        {isManagerOpen && <QuestionnaireManagerModal onClose={() => setIsManagerOpen(false)} />}

        {alert && (
          <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />
        )}
      </Stack>
    </PageHeaderExtended>
  );
}
