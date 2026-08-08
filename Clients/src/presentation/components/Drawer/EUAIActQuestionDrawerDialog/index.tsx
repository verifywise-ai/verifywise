/**
 * EU AI Act Question Drawer Dialog
 *
 * Composes DrawerFrame, EvidenceTab, CrossMappingsTab, and NotesTab. The
 * details tab is drawer-specific (question / hint panels, priority + required
 * badges, answer RichTextEditor, single 3-value status Select), so it does
 * not use the shared WorkflowFields block. Talks to /assessments and the
 * EUAIAct answer endpoints; frameworkId=1; NotesTab bucket
 * EU_AI_ACT_QUESTION.
 */

import React, { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Drawer,
  Stack,
  Typography,
  useTheme,
  SelectChangeEvent,
} from "@mui/material";
import { TabPanel } from "@mui/lab";

import DrawerFrame from "../shared/DrawerFrame";
import EvidenceTab from "../shared/EvidenceTab";
import CrossMappingsTab from "../shared/CrossMappingsTab";
import { useEvidenceFiles } from "../shared/useEvidenceFiles";
import { useLinkedRisks } from "../shared/useLinkedRisks";
import { DrawerTab, LinkedRisk } from "../shared/types";
import { drawerAccessibilityProps } from "../drawerAccessibility";

import RichTextEditor from "../../RichTextEditor";
import Select from "../../Inputs/Select";
import Alert from "../../Alert";
import NotesTab from "../../Notes/NotesTab";

import { EUAIActQuestionDrawerProps, EUAIActFormData, EUAIACT_STATUS_OPTIONS } from "./types";
import { FileData } from "../../../../domain/types/File";
import { Question } from "../../../../domain/types/Question";
import { AlertProps } from "../../../types/alert.types";
import { getPriorityColors } from "../../../pages/Assessment/1.0AssessmentTracker/euaiact.style";

import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { updateEUAIActAnswerById } from "../../../../application/repository/question.repository";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { attachFilesToEntity } from "../../../../application/repository/file.repository";
import { getAssessmentTopicById } from "../../../../application/repository/assesment.repository";
import allowedRoles from "../../../../application/constants/permissions";

const FRAMEWORK_TYPE = "eu_ai_act";
const ENTITY_TYPE = "assessment";
const FRAMEWORK_ID = 1;
const NOTES_ATTACHED_TO = "EU_AI_ACT_QUESTION";

export const inputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

const TABS: DrawerTab[] = [
  { label: "Details", value: "details", icon: "FileText" },
  { label: "Evidence", value: "evidence", icon: "FolderOpen" },
  { label: "Cross mappings", value: "cross-mappings", icon: "Link" },
  { label: "Notes", value: "notes", icon: "MessageSquare" },
];

const statusIdMap = new Map([
  ["Not started", "notStarted"],
  ["In progress", "inProgress"],
  ["Done", "done"],
]);
const idStatusMap = new Map<string, string>();
for (const [name, id] of statusIdMap.entries()) idStatusMap.set(id, name);

const toStatusId = (name?: string) => statusIdMap.get(name || "") || "notStarted";

/** Darken a hex color by a percentage. */
const darkenColor = (hex: string, percent: number): string => {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const newR = Math.max(0, Math.floor(r * (1 - percent / 100)));
  const newG = Math.max(0, Math.floor(g * (1 - percent / 100)));
  const newB = Math.max(0, Math.floor(b * (1 - percent / 100)));
  return `#${newR.toString(16).padStart(2, "0")}${newG
    .toString(16)
    .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
};

const EUAIActQuestionDrawerDialog: React.FC<EUAIActQuestionDrawerProps> = ({
  open,
  onClose,
  question: questionProp,
  subtopic,
  currentProjectId,
  projectFrameworkId,
  onSaveSuccess,
}) => {
  const theme = useTheme();
  const { userRoleName, userId } = useAuth();
  const { users } = useUsers();

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [fetchedQuestion, setFetchedQuestion] = useState<Question | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  const [formData, setFormData] = useState<EUAIActFormData>({
    answer: "",
    status: "notStarted",
  });

  const handleAlert = (payload: { variant: "success" | "error" | "warning" | "info"; body: string }) => {
    setAlert(payload);
    setTimeout(() => setAlert(null), 3000);
  };

  const evidence = useEvidenceFiles({
    frameworkType: FRAMEWORK_TYPE,
    entityType: ENTITY_TYPE,
    onAlert: handleAlert,
  });

  const risks = useLinkedRisks({ onAlert: handleAlert });

  const isEditingDisabled = !allowedRoles.frameworks.edit.includes(userRoleName);

  const fetchLinkedRisks = async (riskIds?: number[]) => {
    if (!questionProp?.answer_id) return;
    const ids = riskIds || risks.currentRisks;
    if (ids.length === 0) {
      risks.applyLinkedRisks([]);
      return;
    }
    try {
      const promises = ids.map((id: number) =>
        getEntityById({ routeUrl: `/projectRisks/${id}` })
          .then((r) => r.data)
          .catch(() => null),
      );
      const results = await Promise.all(promises);
      risks.applyLinkedRisks(results.filter((r) => r !== null) as LinkedRisk[]);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching linked risks:", error);
      }
      risks.applyLinkedRisks([]);
    }
  };

  const applyQuestion = async (q: Question) => {
    setFetchedQuestion(q);
    setFormData({
      answer: q.answer || "",
      status: toStatusId(q.status),
    });
    setEditorKey((prev) => prev + 1);
    await evidence.loadFiles(
      q.answer_id as number,
      q.evidence_files as unknown as FileData[] | null,
    );
    if (q.risks && q.risks.length > 0) {
      await fetchLinkedRisks(q.risks);
    } else {
      risks.applyLinkedRisks([]);
    }
  };

  useEffect(() => {
    if (!open || !questionProp?.answer_id) return;
    evidence.resetPending();
    risks.resetPending();

    if (subtopic?.topic_id && projectFrameworkId) {
      (async () => {
        setIsLoading(true);
        try {
          const response = await getAssessmentTopicById({
            topicId: subtopic.topic_id,
            projectFrameworkId,
          });
          if (response?.data) {
            let found = null as Question | null;
            for (const st of response.data.subTopics || []) {
              if (st.id === subtopic.id) {
                found = (st.questions || []).find(
                  (q: { answer_id: number }) => q.answer_id === questionProp.answer_id,
                ) || null;
                if (found) break;
              }
            }
            if (found) {
              await applyQuestion(found);
            } else {
              await applyQuestion(questionProp);
            }
          }
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("Error fetching question data:", error);
          }
          handleAlert({ variant: "error", body: "Failed to load question data" });
          await applyQuestion(questionProp);
        } finally {
          setIsLoading(false);
        }
      })();
    } else {
      // Fallback: use the prop directly.
      applyQuestion(questionProp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, questionProp?.answer_id, subtopic?.topic_id, projectFrameworkId]);

  const handleAnswerChange = (answer: string) => {
    const cleaned = answer?.replace(/^<p>|<\/p>$/g, "") || "";
    setFormData((prev) => ({ ...prev, answer: cleaned }));
  };

  const handleStatusChange = (event: SelectChangeEvent<string | number>) => {
    setFormData((prev) => ({ ...prev, status: event.target.value.toString() }));
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const refreshFromServer = async () => {
    if (!questionProp?.answer_id || !subtopic?.topic_id || !projectFrameworkId) return;
    try {
      const response = await getAssessmentTopicById({
        topicId: subtopic.topic_id,
        projectFrameworkId,
      });
      if (response?.data) {
        let found = null as Question | null;
        for (const st of response.data.subTopics || []) {
          if (st.id === subtopic.id) {
            found = (st.questions || []).find(
              (q: { answer_id: number }) => q.answer_id === questionProp.answer_id,
            ) || null;
            if (found) break;
          }
        }
        if (found) {
          setFetchedQuestion(found);
          await evidence.loadFiles(
            found.answer_id as number,
            found.evidence_files as unknown as FileData[] | null,
          );
          if (found.risks && found.risks.length > 0) {
            await fetchLinkedRisks(found.risks);
          } else {
            risks.applyLinkedRisks([]);
          }
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error refreshing data:", error);
      }
    }
  };

  const handleSave = async () => {
    if (!questionProp?.answer_id) {
      handleAlert({ variant: "error", body: "No question selected for update" });
      return;
    }
    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("answer", formData.answer);
      formDataToSend.append("status", idStatusMap.get(formData.status) || "Not started");
      formDataToSend.append("user_id", userId?.toString() || "1");
      formDataToSend.append("project_id", currentProjectId.toString());
      formDataToSend.append("delete", JSON.stringify(evidence.deletedFileIds));
      formDataToSend.append("risksDelete", JSON.stringify(risks.deletedRisks));
      formDataToSend.append("risksMitigated", JSON.stringify(risks.selectedRisks));

      evidence.uploadFiles.forEach((file) => {
        if (file.data instanceof Blob) {
          const fileToUpload =
            file.data instanceof File
              ? file.data
              : new File([file.data!], file.fileName, { type: file.type });
          formDataToSend.append("files", fileToUpload);
        }
      });

      const response = await updateEUAIActAnswerById({
        answerId: questionProp.answer_id,
        body: formDataToSend,
      });

      if (response.status === 202) {
        if (evidence.pendingAttachFiles.length > 0 && questionProp?.answer_id) {
          try {
            const fileIds = evidence.pendingAttachFiles.map((f) => parseInt(String(f.id)));
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: FRAMEWORK_TYPE,
              entity_type: ENTITY_TYPE,
              entity_id: questionProp.answer_id,
              project_id: currentProjectId,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("Failed to attach files:", attachError);
          }
        }

        handleAlert({ variant: "success", body: "Question updated successfully" });
        await refreshFromServer();
        evidence.resetPending();
        risks.resetPending();
        onSaveSuccess?.(true, "Question updated successfully", questionProp.question_id);
      } else {
        throw new Error(response.data?.message || "Failed to update question");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      handleAlert({ variant: "error", body: errorMessage });
      onSaveSuccess?.(false, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const displayQuestion = fetchedQuestion || questionProp;

  if (isLoading && !displayQuestion) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        {...drawerAccessibilityProps}
        sx={{
          "width": 850,
          "margin": 0,
          "& .MuiDrawer-paper": { margin: 0, borderRadius: 0 },
        }}
        anchor="right"
      >
        <Stack
          sx={{
            width: 850,
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading question data...</Typography>
        </Stack>
      </Drawer>
    );
  }

  return (
    <>
      <DrawerFrame
        open={open}
        onClose={onClose}
        title={subtopic?.title || ""}
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onSave={handleSave}
        isSaving={isLoading}
        saveDisabled={isEditingDisabled}
        drawerClassName="eu-ai-act-question-drawer-dialog"
      >
        <TabPanel value="details" sx={{ padding: "15px 20px", gap: "15px" }}>
          <Stack gap="15px">
            {displayQuestion?.question && (
              <Stack
                sx={{
                  border: "1px solid #eee",
                  padding: "12px",
                  backgroundColor: "background.accent",
                  borderRadius: "4px",
                }}
              >
                <Typography fontSize={13} sx={{ marginBottom: "8px" }}>
                  <strong>Question:</strong>
                </Typography>
                <Typography fontSize={13} color="text.secondary">
                  {displayQuestion.question}
                </Typography>
              </Stack>
            )}

            {displayQuestion?.hint && (
              <Stack
                sx={{
                  border: "1px solid #d5e8d5",
                  padding: "12px",
                  backgroundColor: "#f5fef5",
                  borderRadius: "4px",
                }}
              >
                <Typography fontSize={13} sx={{ marginBottom: "8px", fontWeight: 600 }}>
                  Hint:
                </Typography>
                <Typography fontSize={13} color="#666">
                  {displayQuestion.hint}
                </Typography>
              </Stack>
            )}

            <Stack direction="row" gap={1} alignItems="center">
              {displayQuestion?.priority_level &&
                (() => {
                  const colors = getPriorityColors(displayQuestion.priority_level);
                  const gradientTop = colors.bg;
                  const gradientBottom = darkenColor(colors.bg, 3);
                  const borderColor = darkenColor(colors.bg, 6);
                  return (
                    <Box
                      key="priority-chip"
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 24,
                        padding: "4px 12px",
                        borderRadius: "4px",
                        background: `linear-gradient(180deg, ${gradientTop} 0%, ${gradientBottom} 100%)`,
                        border: `1px solid ${borderColor}`,
                        color: colors.text,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "capitalize",
                        whiteSpace: "nowrap",
                        lineHeight: 1,
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                      }}
                    >
                      {displayQuestion.priority_level}
                    </Box>
                  );
                })()}
              {displayQuestion?.is_required && (
                <Box
                  key="required-chip"
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 24,
                    padding: "4px 12px",
                    borderRadius: "4px",
                    background: "linear-gradient(180deg, #E6F4EA 0%, #D4E8DB 100%)",
                    border: "1px solid #B8DCC5",
                    color: "primary.main",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    lineHeight: 1,
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  Required
                </Box>
              )}
            </Stack>

            <Stack>
              <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                Answer:
              </Typography>
              <RichTextEditor
                toolbar="full"
                key={`answer-editor-${displayQuestion?.answer_id}-${editorKey}`}
                onContentChange={handleAnswerChange}
                initialContent={formData.answer}
                isEditable={!isEditingDisabled}
                headerSx={{
                  borderRadius: "4px 4px 0 0",
                  borderTop: `1px solid ${theme.palette.border.dark}`,
                  borderColor: "border.dark",
                }}
                bodySx={{
                  "borderColor": "border.dark",
                  "borderRadius": "0 0 4px 4px",
                  "& .ProseMirror > p": { margin: 0 },
                }}
              />
            </Stack>
          </Stack>

          <Stack gap="24px" sx={{ mt: "8px" }}>
            <Select
              id="status"
              label="Status:"
              value={formData.status}
              onChange={handleStatusChange}
              items={EUAIACT_STATUS_OPTIONS.map((option) => ({
                _id: option.id,
                name: option.name,
              }))}
              sx={inputStyles}
              placeholder="Select status"
              disabled={isEditingDisabled}
              getOptionValue={(item) => String(item._id)}
            />
          </Stack>
        </TabPanel>

        <TabPanel value="evidence" sx={{ padding: "15px 20px" }}>
          <EvidenceTab
            evidence={evidence}
            isEditingDisabled={isEditingDisabled}
            acceptedFileTypes="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
            bodyText="Upload evidence files to document compliance with this question."
          />
        </TabPanel>

        <TabPanel value="cross-mappings" sx={{ padding: "15px 20px" }}>
          <CrossMappingsTab
            risks={risks}
            frameworkId={FRAMEWORK_ID}
            isOrganizational={false}
            users={users || []}
            isEditingDisabled={isEditingDisabled}
            onAlert={handleAlert}
            onRiskUpdateSuccess={fetchLinkedRisks}
          />
        </TabPanel>

        <TabPanel value="notes" sx={{ padding: "15px 20px" }}>
          {displayQuestion?.question_id && (
            <NotesTab
              key={`eu-ai-act-question-${displayQuestion.question_id}`}
              attachedTo={NOTES_ATTACHED_TO}
              attachedToId={displayQuestion.question_id.toString()}
            />
          )}
        </TabPanel>
      </DrawerFrame>

      {alert && <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />}
    </>
  );
};

export default EUAIActQuestionDrawerDialog;
