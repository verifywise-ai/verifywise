/**
 * @fileoverview Create-dataset flow modals: choose how to add a dataset,
 * then pick use case + conversation format when creating from scratch.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/CreateDatasetModals
 */

import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Database, Edit3, GitBranch, MessageSquare, Upload } from "lucide-react";
import SelectableCard from "../../../components/SelectableCard";
import ModalStandard from "../../../components/Modals/StandardModal";
import { palette } from "../../../themes/palette";
import type {
  MultiTurnConversation,
  SingleTurnPrompt,
} from "../../../../application/repository/deepEval.repository";

export type NewDatasetUseCase = "chatbot" | "rag";

export type NewDatasetTurnType = "single-turn" | "multi-turn";

export type CreateDatasetDraft = {
  useCase: NewDatasetUseCase;
  turnType: NewDatasetTurnType;
  prompts: Array<SingleTurnPrompt | MultiTurnConversation>;
};

export type CreateDatasetModalsProps = {
  choiceOpen: boolean;
  onChoiceClose: () => void;
  onOpenTypeSelection: () => void;
  onChooseUpload: () => void;
  onChooseTemplate: () => void;
  typeSelectionOpen: boolean;
  onTypeSelectionClose: () => void;
  onCreate: (draft: CreateDatasetDraft) => void;
};

const buildInitialPrompts = (
  useCase: NewDatasetUseCase,
  turnType: NewDatasetTurnType,
): Array<SingleTurnPrompt | MultiTurnConversation> => {
  if (turnType === "single-turn") {
    const singleTurnPrompt: SingleTurnPrompt = {
      id: "prompt_1",
      category: "general",
      prompt: "",
      expected_output: "",
      difficulty: "medium",
      ...(useCase === "rag" ? { retrieval_context: [] } : {}),
    };
    return [singleTurnPrompt];
  }

  const multiTurnConversation: MultiTurnConversation = {
    id: "conversation_1",
    scenario: "",
    expected_outcome: "",
    turns: [{ role: "user", content: "" }],
    ...(useCase === "rag" ? { context: [] } : {}),
  };
  return [multiTurnConversation];
};

export default function CreateDatasetModals({
  choiceOpen,
  onChoiceClose,
  onOpenTypeSelection,
  onChooseUpload,
  onChooseTemplate,
  typeSelectionOpen,
  onTypeSelectionClose,
  onCreate,
}: CreateDatasetModalsProps) {
  const [useCase, setUseCase] = useState<NewDatasetUseCase>("chatbot");
  const [turnType, setTurnType] = useState<NewDatasetTurnType>("single-turn");

  return (
    <>
      {/* Create Dataset Modal - Choice between Editor and Upload */}
      <ModalStandard
        isOpen={choiceOpen}
        onClose={onChoiceClose}
        title="Add dataset"
        description="Choose how you want to add a new dataset"
        maxWidth="480px"
      >
        <Stack spacing="8px">
          {/* Create from scratch option */}
          <SelectableCard
            isSelected={false}
            onClick={onOpenTypeSelection}
            icon={<Edit3 size={14} color={palette.text.disabled} />}
            title="Create from scratch"
            description="Choose format and manually add prompts"
          />

          {/* Upload JSON option */}
          <SelectableCard
            isSelected={false}
            onClick={onChooseUpload}
            icon={<Upload size={14} color={palette.text.disabled} />}
            title="Upload JSON file"
            description="Import existing dataset in JSON format"
          />

          {/* Use template option */}
          <SelectableCard
            isSelected={false}
            onClick={onChooseTemplate}
            icon={<Database size={14} color={palette.text.disabled} />}
            title="Start from template"
            description="Browse pre-built evaluation templates"
          />
        </Stack>
      </ModalStandard>

      {/* Create from scratch - Type Selection Modal */}
      <ModalStandard
        isOpen={typeSelectionOpen}
        onClose={onTypeSelectionClose}
        title="Choose dataset format"
        description="Select the type and format for your new dataset"
        maxWidth="520px"
        submitButtonText="Create Dataset"
        onSubmit={() => {
          onTypeSelectionClose();
          onCreate({
            useCase,
            turnType,
            prompts: buildInitialPrompts(useCase, turnType),
          });
        }}
      >
        <Stack spacing="20px">
          {/* Use Case Selection */}
          <Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: palette.text.secondary, mb: 1.5 }}
            >
              Use Case
            </Typography>
            <Stack direction="row" spacing={1}>
              <Box onClick={() => setUseCase("chatbot")} sx={{ cursor: "pointer", flex: 1 }}>
                <SelectableCard
                  isSelected={useCase === "chatbot"}
                  onClick={() => setUseCase("chatbot")}
                  icon={
                    <MessageSquare
                      size={14}
                      color={useCase === "chatbot" ? palette.brand.primary : palette.text.disabled}
                    />
                  }
                  title="Chatbot"
                  description="Standard Q&A evaluation"
                />
              </Box>
              <Box onClick={() => setUseCase("rag")} sx={{ cursor: "pointer", flex: 1 }}>
                <SelectableCard
                  isSelected={useCase === "rag"}
                  onClick={() => setUseCase("rag")}
                  icon={
                    <Database
                      size={14}
                      color={useCase === "rag" ? palette.brand.primary : palette.text.disabled}
                    />
                  }
                  title="RAG"
                  description="With retrieval context"
                />
              </Box>
            </Stack>
          </Box>

          {/* Turn Type Selection */}
          <Box>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: palette.text.secondary, mb: 1.5 }}
            >
              Conversation Format
            </Typography>
            <Stack direction="row" spacing={1}>
              <Box onClick={() => setTurnType("single-turn")} sx={{ cursor: "pointer", flex: 1 }}>
                <SelectableCard
                  isSelected={turnType === "single-turn"}
                  onClick={() => setTurnType("single-turn")}
                  icon={
                    <MessageSquare
                      size={14}
                      color={
                        turnType === "single-turn" ? palette.brand.primary : palette.text.disabled
                      }
                    />
                  }
                  title="Single-turn"
                  description="One prompt, one response"
                />
              </Box>
              <Box onClick={() => setTurnType("multi-turn")} sx={{ cursor: "pointer", flex: 1 }}>
                <SelectableCard
                  isSelected={turnType === "multi-turn"}
                  onClick={() => setTurnType("multi-turn")}
                  icon={
                    <GitBranch
                      size={14}
                      color={
                        turnType === "multi-turn" ? palette.brand.primary : palette.text.disabled
                      }
                    />
                  }
                  title="Multi-turn"
                  description="Conversation with multiple exchanges"
                />
              </Box>
            </Stack>
          </Box>

          {/* Format Preview */}
          <Box sx={{ backgroundColor: palette.background.accent, borderRadius: "8px", p: 2 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600, color: palette.text.secondary, mb: 1 }}
            >
              Format Preview
            </Typography>
            <Typography variant="body2" sx={{ color: palette.text.tertiary, fontSize: "12px" }}>
              {turnType === "single-turn"
                ? useCase === "rag"
                  ? "Prompts with expected output, category, difficulty, and retrieval_context fields"
                  : "Prompts with expected output, category, and difficulty fields"
                : useCase === "rag"
                  ? "Conversations with scenario, multiple turns (user/assistant), expected outcome, and context"
                  : "Conversations with scenario, multiple turns (user/assistant), and expected outcome"}
            </Typography>
          </Box>
        </Stack>
      </ModalStandard>
    </>
  );
}
