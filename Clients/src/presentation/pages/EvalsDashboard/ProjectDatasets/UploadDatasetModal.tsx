/**
 * @fileoverview Upload-dataset instructions modal: turn type, use case,
 * JSON format preview, example download, and file-picker CTA.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/UploadDatasetModal
 */

import { Box, Stack, Typography } from "@mui/material";
import { Download, Upload } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import ModalStandard from "../../../components/Modals/StandardModal";
import { palette } from "../../../themes/palette";
import {
  getExampleDatasetPayload,
  type ExampleTurnType,
  type ExampleUseCase,
} from "./exampleDatasetPayloads";

export type UploadDatasetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  turnType: ExampleTurnType;
  onTurnTypeChange: (turnType: ExampleTurnType) => void;
  useCase: ExampleUseCase;
  onUseCaseChange: (useCase: ExampleUseCase) => void;
  onUploadClick: () => void;
};

const handleDownloadExample = (turnType: ExampleTurnType, useCase: ExampleUseCase) => {
  const exampleData = getExampleDatasetPayload(turnType, useCase);
  const filename = `example_${turnType}_${useCase}_dataset.json`;

  const blob = new Blob([JSON.stringify(exampleData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export default function UploadDatasetModal({
  isOpen,
  onClose,
  turnType,
  onTurnTypeChange,
  useCase,
  onUseCaseChange,
  onUploadClick,
}: UploadDatasetModalProps) {
  return (
    <ModalStandard
      isOpen={isOpen}
      onClose={onClose}
      title="Upload dataset"
      description="Upload a custom dataset in JSON format for your evaluations"
      customFooter={
        <Stack
          direction="row"
          spacing={2}
          sx={{
            justifyContent: "flex-end",
            width: "100%",
          }}
        >
          <CustomizableButton
            variant="outlined"
            text="Cancel"
            onClick={onClose}
            sx={{
              "minWidth": "80px",
              "height": "34px",
              "border": `1px solid ${palette.border.dark}`,
              "color": palette.text.secondary,
              "&:hover": {
                backgroundColor: palette.background.accent,
                border: `1px solid ${palette.border.dark}`,
              },
            }}
          />
          <CustomizableButton
            variant="contained"
            text="Upload file"
            onClick={onUploadClick}
            startIcon={<Upload size={16} />}
            sx={{
              "minWidth": "120px",
              "height": "34px",
              "backgroundColor": palette.brand.primary,
              "&:hover": {
                backgroundColor: palette.brand.primaryHover,
              },
            }}
          />
        </Stack>
      }
    >
      <Stack spacing={3} sx={{ p: 2 }}>
        {/* Turn type selector - NEW */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1.5 }}>
            Conversation type
          </Typography>
          <Stack direction="row" spacing={1}>
            <Box onClick={() => onTurnTypeChange("single-turn")} sx={{ cursor: "pointer" }}>
              <Chip
                label="Single-Turn"
                uppercase={false}
                backgroundColor={
                  turnType === "single-turn" ? palette.status.warning.bg : palette.background.hover
                }
                textColor={
                  turnType === "single-turn" ? palette.status.warning.text : palette.text.tertiary
                }
              />
            </Box>
            <Box onClick={() => onTurnTypeChange("multi-turn")} sx={{ cursor: "pointer" }}>
              <Chip
                label="Multi-Turn"
                uppercase={false}
                backgroundColor={
                  turnType === "multi-turn" || turnType === "simulated"
                    ? palette.accent.blue.bg
                    : palette.background.hover
                }
                textColor={
                  turnType === "multi-turn" || turnType === "simulated"
                    ? palette.accent.blue.text
                    : palette.text.tertiary
                }
              />
            </Box>
          </Stack>

          {/* Multi-turn sub-options: Default or Simulated */}
          {(turnType === "multi-turn" || turnType === "simulated") && (
            <Box sx={{ mt: 1.5, ml: 2, pl: 2, borderLeft: `2px solid ${palette.accent.blue.bg}` }}>
              <Typography
                variant="body2"
                sx={{ fontSize: "11px", color: palette.text.tertiary, mb: 1 }}
              >
                Multi-turn mode:
              </Typography>
              <Stack direction="row" spacing={1}>
                <Box onClick={() => onTurnTypeChange("multi-turn")} sx={{ cursor: "pointer" }}>
                  <Chip
                    label="Default"
                    size="small"
                    uppercase={false}
                    backgroundColor={
                      turnType === "multi-turn" ? palette.accent.blue.bg : palette.background.hover
                    }
                    textColor={
                      turnType === "multi-turn" ? palette.accent.blue.text : palette.text.tertiary
                    }
                  />
                </Box>
                <Box onClick={() => onTurnTypeChange("simulated")} sx={{ cursor: "pointer" }}>
                  <Chip
                    label="Simulated"
                    size="small"
                    uppercase={false}
                    backgroundColor={
                      turnType === "simulated" ? palette.accent.purple.bg : palette.background.hover
                    }
                    textColor={
                      turnType === "simulated" ? palette.accent.purple.text : palette.text.tertiary
                    }
                  />
                </Box>
              </Stack>
            </Box>
          )}

          <Typography
            variant="body2"
            sx={{ fontSize: "12px", color: palette.text.tertiary, mt: 1.5 }}
          >
            {turnType === "single-turn"
              ? "Simple prompt → response pairs. Best for RAG and basic Q&A evaluation."
              : turnType === "multi-turn"
                ? "Multi-turn conversations with scenario and turns. Best for chatbot and agent evaluation."
                : "Define scenarios only — the AI will simulate full conversations dynamically during evaluation."}
          </Typography>
        </Box>

        {/* Dataset type selector */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1.5 }}>
            Use case
          </Typography>
          <Stack direction="row" spacing={1}>
            {/* Agent evaluation now supported per DeepEval docs */}
            {(["chatbot", "rag", "agent"] as const).map((type) => {
              const isSelected = useCase === type;
              return (
                <Box key={type} onClick={() => onUseCaseChange(type)} sx={{ cursor: "pointer" }}>
                  <Chip
                    label={type === "rag" ? "RAG" : type.charAt(0).toUpperCase() + type.slice(1)}
                    uppercase={false}
                    backgroundColor={
                      isSelected
                        ? type === "chatbot"
                          ? palette.accent.blue.bg
                          : type === "rag"
                            ? palette.accent.indigo.bg
                            : palette.status.error.bg
                        : palette.background.hover
                    }
                    textColor={
                      isSelected
                        ? type === "chatbot"
                          ? palette.accent.blue.text
                          : type === "rag"
                            ? palette.accent.indigo.text
                            : palette.status.error.text
                        : palette.text.tertiary
                    }
                  />
                </Box>
              );
            })}
          </Stack>
          <Typography
            variant="body2"
            sx={{ fontSize: "12px", color: palette.text.tertiary, mt: 1 }}
          >
            {useCase === "chatbot" && "Standard Q&A datasets for evaluating chatbot responses."}
            {useCase === "rag" &&
              "Datasets with retrieval_context for RAG faithfulness & relevancy metrics."}
            {useCase === "agent" &&
              "Datasets with tools_available for evaluating agent reasoning, tool usage, and task completion."}
          </Typography>
        </Box>

        {/* JSON structure based on turn type */}
        <Box>
          <Box
            sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px" }}>
              {turnType === "single-turn"
                ? "Single-Turn"
                : turnType === "multi-turn"
                  ? "Multi-Turn"
                  : "Simulated"}{" "}
              JSON format
            </Typography>
            <CustomizableButton
              size="small"
              variant="text"
              startIcon={<Download size={14} />}
              onClick={() => handleDownloadExample(turnType, useCase)}
              text="Download example"
              sx={{
                "fontSize": "12px",
                "color": palette.brand.primary,
                "&:hover": {
                  backgroundColor: "rgba(19, 113, 91, 0.08)",
                },
              }}
            />
          </Box>
          <Box
            sx={{
              backgroundColor: palette.background.accent,
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "6px",
              p: 2,
              fontFamily: "monospace",
              fontSize: "11px",
              overflow: "auto",
              maxHeight: "220px",
            }}
          >
            <pre style={{ margin: 0 }}>
              {turnType === "single-turn"
                ? `[
  {
    "id": "prompt_001",
    "category": "general",
    "prompt": "What is machine learning?",
    "expected_output": "Machine learning is...",
    "expected_keywords": ["algorithm", "data"],
    "difficulty": "easy"${
      useCase === "rag"
        ? `,
    "retrieval_context": [
      "Context document 1...",
      "Context document 2..."
    ]`
        : useCase === "agent"
          ? `,
    "tools_available": ["web_search"],
    "expected_tools": ["web_search"]`
          : ""
    }
  }
]`
                : turnType === "multi-turn"
                  ? `[
  {
    "scenario": "Customer asking for help",
    "expected_outcome": "Successfully assist customer",${
      useCase === "rag"
        ? `
    "context": ["Relevant document..."],`
        : ""
    }${
      useCase === "agent"
        ? `
    "tools_available": ["search", "calendar"],`
        : ""
    }
    "turns": [
      { "role": "user", "content": "Hi, I need help" },
      { "role": "assistant", "content": "Hello! How can I assist you today?" },
      { "role": "user", "content": "I have a question about..." },
      { "role": "assistant", "content": "I'd be happy to help with that." }
    ]
  }
]`
                  : `[
  {
    "scenario": "User wants to book a flight to Paris",
    "expected_outcome": "Successfully complete flight booking",
    "user_description": "Frequent traveler, prefers window seats",
    "max_turns": 8
  },
  {
    "scenario": "Customer complaining about a defective product",
    "expected_outcome": "Resolve complaint with refund or replacement",
    "user_description": "Frustrated customer, bought item last week"
  }
]`}
            </pre>
          </Box>
          {turnType === "simulated" && (
            <Box
              sx={{
                mt: 1.5,
                p: 1.5,
                backgroundColor: palette.accent.purple.bg,
                borderRadius: "6px",
                border: `1px solid ${palette.accent.purple.border}`,
              }}
            >
              <Typography
                sx={{ fontSize: "12px", color: palette.accent.purple.text, fontWeight: 500 }}
              >
                How Simulated Mode Works
              </Typography>
              <Typography sx={{ fontSize: "11px", color: palette.accent.purple.text, mt: 0.5 }}>
                You provide scenarios only — no need to write conversations. During evaluation, the
                AI will:
                <br />• Simulate a user based on your description
                <br />• Generate realistic multi-turn conversations
                <br />• Evaluate the assistant's responses automatically
              </Typography>
            </Box>
          )}
        </Box>

        {/* Field descriptions based on turn type */}
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1 }}>
            {turnType === "single-turn"
              ? "Single-Turn"
              : turnType === "multi-turn"
                ? "Multi-Turn"
                : "Simulated"}{" "}
            fields
          </Typography>
          <Stack spacing={0.75}>
            <Box>
              <Typography
                component="span"
                sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}
              >
                id
              </Typography>
              <Typography
                component="span"
                sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}
              >
                (required) Unique identifier
              </Typography>
            </Box>
            <Box>
              <Typography
                component="span"
                sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}
              >
                prompt
              </Typography>
              <Typography
                component="span"
                sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}
              >
                (required) The input question or task
              </Typography>
            </Box>
            <Box>
              <Typography
                component="span"
                sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}
              >
                expected_output
              </Typography>
              <Typography
                component="span"
                sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}
              >
                (required) Expected model response
              </Typography>
            </Box>
            {useCase === "rag" && (
              <Box
                sx={{ backgroundColor: palette.accent.indigo.bg, p: 1, borderRadius: 1, mt: 0.5 }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: "monospace",
                    color: palette.accent.indigo.text,
                  }}
                >
                  retrieval_context
                </Typography>
                <Typography
                  component="span"
                  sx={{ fontSize: "12px", color: palette.accent.indigo.text, ml: 1 }}
                >
                  (required for RAG) Array of retrieved context documents
                </Typography>
              </Box>
            )}
            {/* Agent not supported yet */}
            {/* {useCase === "agent" && (
                <>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      scenario
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (required) Description of the conversation scenario
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      turns
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (required) Array of {"{ role, content }"} messages
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      expected_outcome
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (optional) Expected result of the conversation
                    </Typography>
                  </Box>
                </>
              ) : (
                <>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      scenario
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (required) Description of what the user wants to accomplish
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      expected_outcome
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (required) What counts as a successful conversation
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      user_description
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (optional) Persona for the simulated user
                    </Typography>
                  </Box>
                  <Box>
                    <Typography component="span" sx={{ fontSize: "12px", fontWeight: 600, fontFamily: "monospace" }}>
                      max_turns
                    </Typography>
                    <Typography component="span" sx={{ fontSize: "12px", color: "text.secondary", ml: 1 }}>
                      (optional) Maximum turns to simulate (default: 6)
                    </Typography>
                  </Box>
                </>
              )} */}
          </Stack>
        </Box>
      </Stack>
    </ModalStandard>
  );
}
