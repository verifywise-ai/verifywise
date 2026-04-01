import { Box, Typography, Collapse, CircularProgress, useTheme, keyframes } from "@mui/material";
import {
  Type,
  FileText,
  Mail,
  Link,
  Hash,
  Calendar,
  ChevronDown,
  ListChecks,
  CheckSquare,
  Plus,
  ChevronRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import {
  PALETTE_ITEMS,
  PaletteItem,
  HARDCODED_SUGGESTED_QUESTIONS,
  SuggestedQuestion,
  FormField,
  generateFieldId,
  createFieldFromPalette,
} from "./types";
import {
  getLLMSuggestedQuestions,
  LLMSuggestedQuestion,
} from "../../../application/repository/intakeForm.repository";
import { CustomizableButton } from "../../components/button/customizable-button";

// Sparkle shimmer animation
const sparkleShimmer = keyframes`
  0% { opacity: 0.6; filter: brightness(1); }
  50% { opacity: 1; filter: brightness(1.4); }
  100% { opacity: 0.6; filter: brightness(1); }
`;

const sparkleIdle = keyframes`
  0% { transform: scale(1) rotate(0deg); opacity: 0.85; }
  25% { transform: scale(1.15) rotate(8deg); opacity: 1; }
  50% { transform: scale(1) rotate(0deg); opacity: 0.85; }
  75% { transform: scale(1.1) rotate(-6deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 0.85; }
`;

const ICON_MAP: Record<string, React.ElementType> = {
  TextFields: Type,
  Notes: FileText,
  Email: Mail,
  Link: Link,
  Numbers: Hash,
  CalendarMonth: Calendar,
  ArrowDropDownCircle: ChevronDown,
  Checklist: ListChecks,
  CheckBox: CheckSquare,
};

interface ClickablePaletteItemProps {
  item: PaletteItem;
  onAdd: (item: PaletteItem) => void;
}

function ClickablePaletteItem({ item, onAdd }: ClickablePaletteItemProps) {
  const theme = useTheme();
  const IconComponent = ICON_MAP[item.icon] || Type;

  return (
    <Box
      onClick={() => onAdd(item)}
      sx={{
        p: "8px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        backgroundColor: theme.palette.background.main,
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: `${theme.palette.primary.main}80`,
          backgroundColor: theme.palette.background.fill,
          "& .palette-icon svg": {
            color: `${theme.palette.primary.main} !important`,
            stroke: `${theme.palette.primary.main} !important`,
            animation: "icon-shake 400ms ease-in-out",
          },
        },
      }}
    >
      <Box className="palette-icon" sx={{ display: "flex", flexShrink: 0 }}>
        <IconComponent size={16} strokeWidth={1.5} color={theme.palette.text.tertiary} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 500, color: theme.palette.text.primary, fontSize: "13px", lineHeight: 1.3 }}>
          {item.label}
        </Typography>
        <Typography sx={{ color: theme.palette.other.icon, fontSize: "11px", lineHeight: 1.2 }}>
          {item.description}
        </Typography>
      </Box>
      <Plus size={14} color={theme.palette.text.accent} style={{ flexShrink: 0 }} />
    </Box>
  );
}

function groupByCategory(questions: SuggestedQuestion[]): Record<string, SuggestedQuestion[]> {
  return questions.reduce<Record<string, SuggestedQuestion[]>>((acc, q) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push(q);
    return acc;
  }, {});
}

interface SuggestedCategoryProps {
  category: string;
  questions: SuggestedQuestion[];
  fieldCount: number;
  addedLabels: Set<string>;
  onAdd: (field: FormField) => void;
}

function SuggestedCategory({ category, questions, fieldCount, addedLabels, onAdd }: SuggestedCategoryProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const availableQuestions = questions.filter((q) => !addedLabels.has(q.label));
  if (availableQuestions.length === 0) return null;

  const handleAdd = (question: SuggestedQuestion) => {
    const field: FormField = {
      id: generateFieldId(),
      type: question.fieldType,
      label: question.label,
      helpText: question.guidanceText,
      options: question.options,
      order: fieldCount,
    };
    onAdd(field);
  };

  return (
    <Box>
      <Box
        onClick={() => setOpen((prev) => !prev)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          px: "4px",
          py: "6px",
          cursor: "pointer",
          borderRadius: "4px",
          "&:hover": { backgroundColor: theme.palette.background.accent },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            transition: "transform 0.15s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            color: theme.palette.other.icon,
          }}
        >
          <ChevronRight size={14} />
        </Box>
        <Typography sx={{ fontWeight: 600, color: theme.palette.text.secondary, fontSize: "12px", flex: 1 }}>
          {category}
        </Typography>
        <Typography sx={{ color: theme.palette.text.accent, fontSize: "11px" }}>
          {availableQuestions.length}
        </Typography>
      </Box>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ pl: 1, display: "flex", flexDirection: "column" }}>
          {availableQuestions.map((question, index) => (
            <Box
              key={index}
              onClick={() => handleAdd(question)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                py: "4px",
                px: "4px",
                borderRadius: "4px",
                cursor: "pointer",
                "&:hover": {
                  backgroundColor: theme.palette.background.accent,
                  "& .add-icon": { opacity: 1 },
                },
              }}
            >
              <Typography
                sx={{ flex: 1, color: theme.palette.text.tertiary, fontSize: "11.5px", lineHeight: 1.4 }}
              >
                {question.label}
              </Typography>
              <Box
                className="add-icon"
                sx={{
                  opacity: 0,
                  transition: "opacity 0.15s ease",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  color: theme.palette.primary.main,
                }}
              >
                <Plus size={14} />
              </Box>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// LLM Question Item — flat list (no categories)
// ============================================================================

interface LLMQuestionItemProps {
  question: LLMSuggestedQuestion;
  fieldCount: number;
  onAdd: (field: FormField) => void;
  onDismiss: (question: LLMSuggestedQuestion) => void;
}

function LLMQuestionItem({ question, fieldCount, onAdd, onDismiss }: LLMQuestionItemProps) {
  const theme = useTheme();

  const handleAdd = () => {
    const field: FormField = {
      id: generateFieldId(),
      type: question.fieldType,
      label: question.label,
      helpText: question.guidanceText,
      options: question.options,
      order: fieldCount,
    };
    onAdd(field);
  };

  return (
    <Box
      onClick={handleAdd}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        py: "6px",
        px: "6px",
        borderRadius: "4px",
        cursor: "pointer",
        "&:hover": {
          backgroundColor: theme.palette.background.fill,
          "& .add-icon": { opacity: 1 },
          "& .dismiss-icon": { opacity: 1 },
        },
      }}
    >
      <Typography sx={{ flex: 1, color: theme.palette.text.secondary, fontSize: "13px", lineHeight: 1.4, minWidth: 0 }}>
        {question.label}
      </Typography>
      <Box
        className="dismiss-icon"
        onClick={(e) => { e.stopPropagation(); onDismiss(question); }}
        sx={{
          opacity: 0,
          transition: "opacity 0.15s ease",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          color: theme.palette.text.accent,
          borderRadius: "4px",
          p: "2px",
          "&:hover": { color: theme.palette.status.error.text, backgroundColor: theme.palette.background.main },
        }}
      >
        <X size={13} />
      </Box>
      <Box
        className="add-icon"
        sx={{
          opacity: 0,
          transition: "opacity 0.15s ease",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          color: theme.palette.primary.main,
        }}
      >
        <Plus size={14} />
      </Box>
    </Box>
  );
}

// ============================================================================
// SuggestedQuestionsPanel — LLM mode (Option B) or hardcoded fallback
// ============================================================================

export interface SuggestedQuestionsPanelHandle {
  /** Called by the parent whenever a field is added (from any source). */
  onFieldAdded: () => void;
}

export interface SuggestedQuestionsPanelProps {
  fieldCount: number;
  existingFieldLabels: string[];
  entityType: string;
  llmKeyId?: number | null;
  onAdd: (field: FormField) => void;
}

export const SuggestedQuestionsPanel = forwardRef<SuggestedQuestionsPanelHandle, SuggestedQuestionsPanelProps>(
  function SuggestedQuestionsPanel(
    { fieldCount, existingFieldLabels, entityType, llmKeyId, onAdd },
    ref
  ) {
    const theme = useTheme();
    const hasLLM = !!llmKeyId;

    // Collapse state
    const [isOpen, setIsOpen] = useState(true);

    // Sparkle animation state — triggered when new questions arrive
    const [isSparkleAnimating, setIsSparkleAnimating] = useState(false);
    const sparkleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerSparkle = useCallback(() => {
      setIsSparkleAnimating(true);
      if (sparkleTimerRef.current) clearTimeout(sparkleTimerRef.current);
      sparkleTimerRef.current = setTimeout(() => setIsSparkleAnimating(false), 2400);
    }, []);

    // Track which questions have already been added (by label match)
    const addedLabels = new Set(existingFieldLabels.map((l) => l.toLowerCase()));

    // Track dismissed questions so they never come back
    const [dismissedLabels, setDismissedLabels] = useState<Set<string>>(new Set());

    // LLM state
    const [llmQuestions, setLlmQuestions] = useState<LLMSuggestedQuestion[]>([]);
    const [llmLoading, setLlmLoading] = useState(false);
    const [llmError, setLlmError] = useState<string | null>(null);
    const [llmFetched, setLlmFetched] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    // Debounce timer for re-fetch after field add
    const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const buildContext = useCallback((extraDismissed?: string[]) => {
      const parts: string[] = [];
      if (existingFieldLabels.length > 0) {
        parts.push(`Existing fields: ${existingFieldLabels.join(", ")}`);
      }
      const allDismissed = [...dismissedLabels, ...(extraDismissed || [])];
      if (allDismissed.length > 0) {
        parts.push(`Do NOT suggest these questions (already dismissed): ${allDismissed.join(", ")}`);
      }
      return parts.join(". ");
    }, [existingFieldLabels, dismissedLabels]);

    const fetchLLMQuestions = useCallback(async (autoOpen?: boolean) => {
      if (!llmKeyId) return;
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLlmLoading(true);
      setLlmError(null);
      try {
        const result = await getLLMSuggestedQuestions(
          entityType,
          buildContext(),
          llmKeyId,
          controller.signal
        );
        if (!controller.signal.aborted) {
          const newQuestions = result.data || [];
          setLlmQuestions(newQuestions);
          setLlmFetched(true);
          // If we got new questions and the pane should auto-open
          if (autoOpen && newQuestions.length > 0) {
            setIsOpen(true);
            triggerSparkle();
          }
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          setLlmError("Could not generate questions. Check your LLM key.");
          setLlmFetched(true);
        }
      } finally {
        if (!controller.signal.aborted) setLlmLoading(false);
      }
    }, [llmKeyId, entityType, buildContext, triggerSparkle]);

    // Fetch a single replacement question after dismissal
    const fetchSingleReplacement = useCallback(async (dismissedLabel: string) => {
      if (!llmKeyId) return;
      const controller = new AbortController();
      try {
        const result = await getLLMSuggestedQuestions(
          entityType,
          buildContext([dismissedLabel]) + ". Generate exactly 1 new question only.",
          llmKeyId,
          controller.signal
        );
        if (!controller.signal.aborted) {
          const newQuestions = result.data || [];
          if (newQuestions.length > 0) {
            // Only add the first replacement, filter out any that are already present or dismissed
            const replacement = newQuestions.find(
              (q) =>
                !addedLabels.has(q.label.toLowerCase()) &&
                !dismissedLabels.has(q.label) &&
                q.label !== dismissedLabel &&
                !llmQuestions.some((existing) => existing.label === q.label)
            );
            if (replacement) {
              setLlmQuestions((prev) => [...prev, replacement]);
            }
          }
        }
      } catch {
        // Silently fail — the question was already removed, no need to show an error
      }
    }, [llmKeyId, entityType, buildContext, addedLabels, dismissedLabels, llmQuestions]);

    // Auto-fetch on mount when LLM key is set
    useEffect(() => {
      if (hasLLM && !llmFetched && !llmLoading) {
        fetchLLMQuestions();
        triggerSparkle();
      }
      return () => {
        if (abortRef.current) abortRef.current.abort();
      };
    }, [hasLLM]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup timers on unmount
    useEffect(() => {
      return () => {
        if (sparkleTimerRef.current) clearTimeout(sparkleTimerRef.current);
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      };
    }, []);

    // Expose onFieldAdded to parent via ref (no-op now — re-fetch is not triggered on add)
    useImperativeHandle(ref, () => ({
      onFieldAdded: () => {},
    }), []);

    const handleAdd = useCallback(
      (field: FormField) => {
        onAdd(field);
        // Remove from LLM list when added
        setLlmQuestions((prev) => prev.filter((q) => q.label !== field.label));
      },
      [onAdd]
    );

    const handleDismiss = useCallback(
      (question: LLMSuggestedQuestion) => {
        // Permanently mark as dismissed
        setDismissedLabels((prev) => new Set(prev).add(question.label));
        // Remove from current list
        setLlmQuestions((prev) => prev.filter((q) => q.label !== question.label));
        // Fetch a single replacement in the background
        fetchSingleReplacement(question.label);
      },
      [fetchSingleReplacement]
    );

    // Filter out already-added and dismissed questions
    const filteredLLMQuestions = llmQuestions.filter(
      (q) => !addedLabels.has(q.label.toLowerCase()) && !dismissedLabels.has(q.label)
    );

    // ── LLM mode ──
    if (hasLLM) {
      return (
        <Box
          sx={{
            borderTop: `1px solid ${theme.palette.border.dark}`,
            backgroundColor: theme.palette.background.accent,
            flexShrink: 0,
          }}
        >
          {/* Collapsible header */}
          <Box
            onClick={() => setIsOpen((prev) => !prev)}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: "16px",
              py: "10px",
              cursor: "pointer",
              userSelect: "none",
              "&:hover": { backgroundColor: theme.palette.background.fill },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Box
                sx={{
                  display: "flex",
                  animation: isSparkleAnimating
                    ? `${sparkleShimmer} 0.8s ease-in-out 3`
                    : `${sparkleIdle} 3s ease-in-out infinite`,
                }}
              >
                <Sparkles size={14} color="#7c3aed" />
              </Box>
              <Typography
                sx={{
                  fontWeight: 600,
                  color: "#7c3aed",
                  fontSize: "13px",
                  ...(isSparkleAnimating ? { animation: `${sparkleShimmer} 0.8s ease-in-out 3` } : {}),
                }}
              >
                AI-suggested questions
              </Typography>
              {filteredLLMQuestions.length > 0 && !llmLoading && (
                <Typography
                  sx={{
                    fontSize: "11px",
                    color: theme.palette.text.accent,
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "10px",
                    px: "6px",
                    py: "1px",
                    fontWeight: 500,
                  }}
                >
                  {filteredLLMQuestions.length}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {llmFetched && !llmLoading && (
                <Box
                  onClick={(e) => { e.stopPropagation(); setDismissedLabels(new Set()); fetchLLMQuestions(); }}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    color: theme.palette.text.accent,
                    borderRadius: "4px",
                    px: "6px",
                    py: "2px",
                    "&:hover": { backgroundColor: theme.palette.background.main, color: theme.palette.primary.main },
                  }}
                >
                  <RefreshCw size={12} />
                  <Typography sx={{ fontSize: "11px" }}>Regenerate</Typography>
                </Box>
              )}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  transition: "transform 0.2s ease",
                  transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  color: theme.palette.other.icon,
                }}
              >
                <ChevronDown size={14} />
              </Box>
            </Box>
          </Box>

          <Collapse in={isOpen} timeout={300}>
            <Box sx={{ px: "16px", pb: "12px" }}>
              {llmLoading && (
                <Box sx={{ display: "flex", alignItems: "center", gap: "8px", py: "12px" }}>
                  <CircularProgress size={16} sx={{ color: theme.palette.primary.main }} />
                  <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent }}>
                    Generating questions...
                  </Typography>
                </Box>
              )}

              {llmError && (
                <Box sx={{ display: "flex", alignItems: "center", gap: "6px", py: "8px" }}>
                  <AlertCircle size={14} color={theme.palette.status.error.text} />
                  <Typography sx={{ fontSize: "11px", color: theme.palette.status.error.text, flex: 1 }}>
                    {llmError}
                  </Typography>
                  <CustomizableButton
                    variant="text"
                    onClick={() => fetchLLMQuestions()}
                    sx={{ height: 24, fontSize: "11px", color: theme.palette.primary.main, minWidth: 0, px: "8px" }}
                  >
                    Retry
                  </CustomizableButton>
                </Box>
              )}

              {!llmLoading && !llmError && filteredLLMQuestions.length > 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {filteredLLMQuestions.map((question, index) => (
                    <LLMQuestionItem
                      key={`${question.label}-${index}`}
                      question={question}
                      fieldCount={fieldCount}
                      onAdd={handleAdd}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </Box>
              )}

              {!llmLoading && !llmError && llmFetched && filteredLLMQuestions.length === 0 && (
                <Box sx={{ py: "8px" }}>
                  <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent }}>
                    All suggested questions have been added. Click regenerate for more.
                  </Typography>
                </Box>
              )}
            </Box>
          </Collapse>
        </Box>
      );
    }

    // ── Hardcoded fallback ──
    const grouped = groupByCategory(HARDCODED_SUGGESTED_QUESTIONS);
    const categories = Object.keys(grouped);

    return (
      <Box
        sx={{
          borderTop: `1px solid ${theme.palette.border.dark}`,
          backgroundColor: theme.palette.background.accent,
          flexShrink: 0,
        }}
      >
        {/* Collapsible header */}
        <Box
          onClick={() => setIsOpen((prev) => !prev)}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: "16px",
            py: "10px",
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { backgroundColor: theme.palette.background.fill },
          }}
        >
          <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: "13px" }}>
            Suggested questions
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              transition: "transform 0.2s ease",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              color: theme.palette.other.icon,
            }}
          >
            <ChevronDown size={14} />
          </Box>
        </Box>

        <Collapse in={isOpen} timeout={300}>
          <Box sx={{ px: "16px", pb: "12px" }}>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {categories.map((category) => (
                <SuggestedCategory
                  key={category}
                  category={category}
                  questions={grouped[category]}
                  fieldCount={fieldCount}
                  addedLabels={addedLabels}
                  onAdd={onAdd}
                />
              ))}
            </Box>
          </Box>
        </Collapse>
      </Box>
    );
  }
);

interface FieldPaletteProps {
  disabled?: boolean;
  fieldCount?: number;
  onAddField: (field: FormField) => void;
}

export function FieldPalette({
  disabled = false,
  fieldCount = 0,
  onAddField,
}: FieldPaletteProps) {
  const theme = useTheme();
  const handleAddPaletteItem = (item: PaletteItem) => {
    const field = createFieldFromPalette(item, fieldCount);
    onAddField(field);
  };

  return (
    <Box
      sx={{
        width: 240,
        height: "100%",
        borderRight: `1px solid ${theme.palette.border.dark}`,
        backgroundColor: theme.palette.background.accent,
        display: "flex",
        flexDirection: "column",
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.border.dark}` }}>
        <Typography sx={{ fontWeight: 600, color: theme.palette.text.primary, fontSize: "14px" }}>
          Field types
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <Box sx={{ p: "8px" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {PALETTE_ITEMS.map((item) => (
              <ClickablePaletteItem key={item.type} item={item} onAdd={handleAddPaletteItem} />
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default FieldPalette;
