import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  useTheme,
  CircularProgress,
  Popover,
} from "@mui/material";
import {
  Sparkles,
  WandSparkles,
  PenLine,
  BookOpen,
  Minimize2,
  Maximize2,
  CheckCircle,
  Languages,
  ListChecks,
  X,
  Square,
} from "lucide-react";
import { useCompletion } from "@ai-sdk/react";
import { CustomizableButton } from "../button/customizable-button";
import { store } from "../../../application/redux/store";
import { text } from "../../themes/palette";

interface AIEditorMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  selectedText: string;
  onInsertBelow: (text: string) => void;
  onReplaceSelection: (text: string) => void;
}

interface AIAction {
  label: string;
  icon: React.ReactNode;
  prompt: string;
  mode: "replace" | "insert";
}

const AI_ACTIONS: AIAction[] = [
  {
    label: "Improve writing",
    icon: <WandSparkles size={14} strokeWidth={1.5} />,
    prompt: "Improve the following text. Make it clearer, more concise, and more professional. Return only the improved text:\n\n",
    mode: "replace",
  },
  {
    label: "Fix grammar",
    icon: <CheckCircle size={14} strokeWidth={1.5} />,
    prompt: "Fix any grammar, spelling, and punctuation errors in the following text. Return only the corrected text:\n\n",
    mode: "replace",
  },
  {
    label: "Make shorter",
    icon: <Minimize2 size={14} strokeWidth={1.5} />,
    prompt: "Make the following text shorter and more concise while keeping the key points. Return only the shortened text:\n\n",
    mode: "replace",
  },
  {
    label: "Make longer",
    icon: <Maximize2 size={14} strokeWidth={1.5} />,
    prompt: "Expand the following text with more detail and explanation while maintaining the same tone. Return only the expanded text:\n\n",
    mode: "replace",
  },
  {
    label: "Simplify language",
    icon: <Languages size={14} strokeWidth={1.5} />,
    prompt: "Simplify the following text to make it easier to understand. Use shorter sentences and simpler words. Return only the simplified text:\n\n",
    mode: "replace",
  },
  {
    label: "Summarize",
    icon: <BookOpen size={14} strokeWidth={1.5} />,
    prompt: "Summarize the following text into a brief, clear summary. Return only the summary:\n\n",
    mode: "replace",
  },
  {
    label: "Generate action items",
    icon: <ListChecks size={14} strokeWidth={1.5} />,
    prompt: "Extract action items from the following text. Format as a bulleted list. Return only the action items:\n\n",
    mode: "insert",
  },
  {
    label: "Continue writing",
    icon: <PenLine size={14} strokeWidth={1.5} />,
    prompt: "Continue writing from where the following text left off. Match the same tone and style. Return only the continuation:\n\n",
    mode: "insert",
  },
];

const AIEditorMenu: React.FC<AIEditorMenuProps> = ({
  anchorEl,
  open,
  onClose,
  selectedText,
  onInsertBelow,
  onReplaceSelection,
}) => {
  const theme = useTheme();
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const token = store.getState().auth.authToken;

  const { completion, complete, isLoading, stop, setCompletion, error } = useCompletion({
    api: "/api/ai/editor/command",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  useEffect(() => {
    if (open) {
      setActiveAction(null);
      setCompletion("");
      setCustomPrompt("");
      setTimeout(() => customInputRef.current?.focus(), 100);
    }
  }, [open, setCompletion]);

  const handleAction = async (action: AIAction) => {
    setActiveAction(action);
    setCompletion("");
    await complete(action.prompt + selectedText);
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim()) return;

    const action: AIAction = {
      label: "Custom",
      icon: <Sparkles size={14} />,
      prompt: customPrompt + (selectedText ? "\n\nContext:\n" : ""),
      mode: selectedText ? "replace" : "insert",
    };
    setActiveAction(action);
    setCompletion("");
    await complete(action.prompt + selectedText);
  };

  const handleAccept = () => {
    if (!completion) return;

    if (activeAction?.mode === "replace" && selectedText) {
      onReplaceSelection(completion);
    } else {
      onInsertBelow(completion);
    }
    onClose();
  };

  const handleDiscard = () => {
    stop();
    setActiveAction(null);
    setCompletion("");
  };

  const showResult = activeAction && (isLoading || completion || error);

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      sx={{
        mt: 1,
        "& .MuiPopover-paper": {
          width: 300,
          borderRadius: "4px",
          border: `1px solid ${theme.palette.border.dark}`,
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
          overflow: "hidden",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: theme.spacing(1),
          px: theme.spacing(2),
          py: theme.spacing(1.5),
          borderBottom: `1px solid ${theme.palette.border.dark}`,
        }}
      >
        <Sparkles size={14} color={theme.palette.primary.main} strokeWidth={1.5} />
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.palette.text.secondary,
            flex: 1,
          }}
        >
          AI assist
        </Typography>
        <Box
          onClick={onClose}
          sx={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            p: 0.25,
            borderRadius: "4px",
            "&:hover": { backgroundColor: theme.palette.background.accent },
          }}
        >
          <X size={14} color={text.muted} strokeWidth={1.5} />
        </Box>
      </Box>

      {/* Custom prompt input */}
      <Box
        component="form"
        onSubmit={handleCustomSubmit}
        sx={{
          px: theme.spacing(2),
          py: theme.spacing(1.5),
          borderBottom: `1px solid ${theme.palette.border.dark}`,
        }}
      >
        <input
          ref={customInputRef}
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder={selectedText ? "Ask AI to edit selection..." : "Ask AI to write..."}
          disabled={isLoading}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            fontSize: 13,
            color: theme.palette.text.secondary,
            backgroundColor: "transparent",
            fontFamily: "inherit",
          }}
        />
      </Box>

      {/* Result area */}
      {showResult && (
        <Box
          sx={{
            px: theme.spacing(2),
            py: theme.spacing(2),
            maxHeight: 200,
            overflowY: "auto",
            borderBottom: `1px solid ${theme.palette.border.dark}`,
          }}
        >
          {isLoading && !completion && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} sx={{ color: theme.palette.primary.main }} />
              <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary }}>
                Generating...
              </Typography>
            </Box>
          )}
          {error && !completion && (
            <Typography sx={{ fontSize: 13, color: theme.palette.error.main }}>
              Failed to get AI response. Check LLM key in settings.
            </Typography>
          )}
          {completion && (
            <Typography
              sx={{
                fontSize: 13,
                color: theme.palette.text.secondary,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {completion}
              {isLoading && (
                <Box component="span" sx={{ display: "inline-flex", ml: 0.5, verticalAlign: "middle" }}>
                  <CircularProgress size={10} sx={{ color: theme.palette.primary.main }} />
                </Box>
              )}
            </Typography>
          )}

          {/* Accept / Discard / Stop buttons */}
          <Box sx={{ display: "flex", gap: 1, mt: theme.spacing(2) }}>
            {!isLoading && completion && (
              <>
                <CustomizableButton
                  variant="contained"
                  text={activeAction?.mode === "replace" && selectedText ? "Replace" : "Insert"}
                  onClick={handleAccept}
                  icon={<CheckCircle size={14} strokeWidth={1.5} />}
                  sx={{
                    height: 30,
                    fontSize: 12,
                    backgroundColor: theme.palette.primary.main,
                    border: `1px solid ${theme.palette.primary.main}`,
                    "&:hover": { backgroundColor: "brand.primaryHover" },
                  }}
                />
                <CustomizableButton
                  variant="outlined"
                  text="Discard"
                  onClick={handleDiscard}
                  icon={<X size={14} strokeWidth={1.5} />}
                  sx={{
                    height: 30,
                    fontSize: 12,
                    backgroundColor: "background.main",
                    border: `1px solid ${theme.palette.border.dark}`,
                    color: theme.palette.text.tertiary,
                    "&:hover": { backgroundColor: theme.palette.background.accent },
                  }}
                />
              </>
            )}
            {isLoading && (
              <CustomizableButton
                variant="outlined"
                text="Stop"
                onClick={() => stop()}
                icon={<Square size={12} strokeWidth={1.5} />}
                sx={{
                  height: 30,
                  fontSize: 12,
                  backgroundColor: "background.main",
                  border: `1px solid ${theme.palette.border.dark}`,
                  color: theme.palette.text.tertiary,
                  "&:hover": { backgroundColor: theme.palette.background.accent },
                }}
              />
            )}
          </Box>
        </Box>
      )}

      {/* Action list */}
      {!showResult && (
        <Box sx={{ py: theme.spacing(0.5) }}>
          {selectedText && (
            <Typography
              sx={{
                px: theme.spacing(2),
                py: theme.spacing(0.5),
                fontSize: 11,
                color: theme.palette.text.tertiary,
                textTransform: "uppercase",
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              Edit selection
            </Typography>
          )}
          {AI_ACTIONS.filter((a) => (selectedText ? true : a.mode === "insert")).map((action) => (
            <Box
              key={action.label}
              onClick={() => handleAction(action)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: theme.spacing(1.5),
                px: theme.spacing(2),
                py: theme.spacing(1),
                cursor: "pointer",
                transition: "background-color 0.15s",
                "&:hover": { backgroundColor: theme.palette.background.accent },
              }}
            >
              <Box sx={{ color: theme.palette.text.tertiary, display: "flex" }}>
                {action.icon}
              </Box>
              <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                {action.label}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Popover>
  );
};

export default AIEditorMenu;
