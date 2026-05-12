import { useState, useEffect, useRef, KeyboardEvent, ChangeEvent } from "react";
import React from "react";
import {
  Box,
  Stack,
  Typography,
  IconButton,
  CircularProgress,
  Menu,
  MenuItem,
  Divider,
  Tooltip,
} from "@mui/material";
import { Send, Bot, ChevronDown, Trash2, Paperclip, X, FileText, Mic, Plus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import CustomAxios from "../../../infrastructure/api/customAxios";
import { evalModelsService, type SavedModel } from "../../../infrastructure/api/evalModelsService";
import * as ProviderIcons from "../../components/ProviderIcons";
import palette from "../../themes/palette";

interface Message {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 data URLs — shown inline in the bubble
}

interface Attachment {
  name: string;
  type: "image" | "document";
  dataUrl: string;
  preview?: string;
}

interface PlaygroundPageProps {
  orgId: string;
  onNavigateToModels: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIcon = React.FC<any>;

const DIRECT_PROVIDER_ICON: Record<string, AnyIcon> = {
  openai: ProviderIcons.OpenAI,
  anthropic: ProviderIcons.Anthropic,
  google: ProviderIcons.Google,
  mistral: ProviderIcons.Mistral,
  xai: ProviderIcons.XAI,
  openrouter: ProviderIcons.OpenRouter,
  huggingface: ProviderIcons.HuggingFace,
  ollama: ProviderIcons.Ollama,
  groq: ProviderIcons.Groq,
  deepseek: ProviderIcons.DeepSeek,
  moonshot: ProviderIcons.Moonshot,
  qwen: ProviderIcons.Qwen,
};

const OPENROUTER_SUB_ICON: Record<string, AnyIcon | null> = {
  "anthropic": ProviderIcons.Anthropic,
  "openai": ProviderIcons.OpenAI,
  "meta-llama": ProviderIcons.Meta,
  "meta": ProviderIcons.Meta,
  "google": ProviderIcons.Google,
  "mistralai": ProviderIcons.Mistral,
  "mistral": ProviderIcons.Mistral,
  "deepseek": ProviderIcons.DeepSeek,
  "microsoft": ProviderIcons.Microsoft,
  "cohere": ProviderIcons.Cohere,
  "perplexity": ProviderIcons.Perplexity,
  "nvidia": ProviderIcons.Nvidia,
  "together": ProviderIcons.Together,
  "groq": ProviderIcons.Groq,
  "moonshotai": ProviderIcons.Moonshot,
  "qwen": ProviderIcons.Qwen,
  "x-ai": ProviderIcons.XAI,
};

function getModelIcon(model: SavedModel): AnyIcon | null {
  const provider = model.provider.toLowerCase();
  if (provider === "openrouter" && model.name.includes("/")) {
    const prefix = model.name.split("/")[0].toLowerCase();
    return OPENROUTER_SUB_ICON[prefix] ?? DIRECT_PROVIDER_ICON.openrouter;
  }
  return DIRECT_PROVIDER_ICON[provider] ?? null;
}

// Models that support image inputs
const VISION_PATTERNS = [
  /gpt-4o/i,
  /gpt-4.*vision/i,
  /claude-3/i,
  /gemini/i,
  /vision/i,
  /pixtral/i,
  /llava/i,
  /qwen.*vl/i,
  /idefics/i,
];

function isVisionCapable(model: SavedModel | undefined): boolean {
  if (!model) return false;
  return VISION_PATTERNS.some((p) => p.test(model.name));
}

// Pulse keyframe for mic animation
const pulseKeyframes = `
@keyframes vw-mic-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
  70%  { box-shadow: 0 0 0 9px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
`;

export default function PlaygroundPage({ orgId, onNavigateToModels }: PlaygroundPageProps) {
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dictating, setDictating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const models = await evalModelsService.listModels(orgId);
        setSavedModels(models);
        if (models.length > 0) setSelectedModelId(models[0].id);
      } catch {
        /* silent */
      }
    };
    load();
  }, [orgId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-focus the textarea whenever it becomes interactive
  useEffect(() => {
    if (!loading && selectedModelId) textareaRef.current?.focus();
  }, [loading, selectedModelId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const selectedModel = savedModels.find((m) => m.id === selectedModelId);
  const ModelIcon = selectedModel ? getModelIcon(selectedModel) : null;
  const visionOk = isVisionCapable(selectedModel);

  // File attachment
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newAttachments: Attachment[] = [];
    for (const file of files) {
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        if (file.type.startsWith("image/")) {
          reader.onload = () => {
            newAttachments.push({
              name: file.name,
              type: "image",
              dataUrl: reader.result as string,
              preview: reader.result as string,
            });
            resolve();
          };
          reader.readAsDataURL(file);
        } else {
          reader.onload = () => {
            newAttachments.push({
              name: file.name,
              type: "document",
              dataUrl: reader.result as string,
            });
            resolve();
          };
          reader.readAsText(file);
        }
      });
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = "";
    textareaRef.current?.focus();
  };

  const removeAttachment = (idx: number) =>
    setAttachments((prev) => prev.filter((_, i) => i !== idx));

  // Dictation
  const toggleDictation = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (dictating && recognitionRef.current) {
      recognitionRef.current.stop();
      setDictating(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t + " ";
        } else {
          interim = t;
        }
      }
      setInput((prev) => {
        const base = prev.replace(/\s*\[.*?\]$/, "").trimEnd();
        return (base + " " + finalTranscript + (interim ? `[${interim}]` : "")).trimStart();
      });
    };
    recognition.onerror = () => {
      setDictating(false);
      textareaRef.current?.focus();
    };
    recognition.onend = () => {
      setDictating(false);
      setInput((prev) => prev.replace(/\s*\[.*?\]$/, "").trimEnd());
      textareaRef.current?.focus();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setDictating(true);
  };

  // Send
  const sendMessage = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !attachments.length) || loading || !selectedModel) return;

    let userText = trimmed;
    // Append document text as context
    attachments
      .filter((a) => a.type === "document")
      .forEach((d) => {
        userText = userText
          ? `${userText}\n\n[Document: ${d.name}]\n${d.dataUrl}`
          : `[Document: ${d.name}]\n${d.dataUrl}`;
      });

    // Collect image previews to display in the bubble; mention names in text for the model
    const imagePreviews = attachments.filter((a) => a.type === "image").map((a) => a.preview!);
    if (imagePreviews.length > 0) {
      const imgNote = attachments
        .filter((a) => a.type === "image")
        .map((a) => `[Image: ${a.name}]`)
        .join(", ");
      userText = userText ? `${userText}\n${imgNote}` : imgNote;
    }

    const userMessage: Message = {
      role: "user",
      content: userText,
      ...(imagePreviews.length > 0 ? { images: imagePreviews } : {}),
    };
    const newMessages: Message[] = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setAttachments([]);
    setLoading(true);
    setError(null);

    try {
      // Build API messages — for vision messages use the OpenAI multimodal content array format
      const apiMessages = newMessages.map(({ role, content, images }) => {
        if (images && images.length > 0) {
          const parts: Array<{ type: string; [k: string]: any }> = [];
          const textOnly = content.replace(/\[Image:[^\]]*\]/g, "").trim();
          if (textOnly) parts.push({ type: "text", text: textOnly });
          images.forEach((url) => parts.push({ type: "image_url", image_url: { url } }));
          return { role, content: parts };
        }
        return { role, content };
      });
      const res = await CustomAxios.post<{ content: string }>("/deepeval/playground/chat", {
        model: selectedModel.name,
        provider: selectedModel.provider,
        messages: apiMessages,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.data?.content ?? "" }]);
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          "Something went wrong",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const hasMessages = messages.length > 0;
  const canSend =
    (input.trim().length > 0 || attachments.length > 0) && !!selectedModelId && !loading;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 155px)",
        minHeight: 480,
      }}
    >
      {/* Inject pulse keyframes */}
      <style>{pulseKeyframes}</style>

      {/* ── Top bar: left-aligned model picker ─────────────────────────── */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: "16px",
          flexShrink: 0,
        }}
      >
        {/* Model picker */}
        <Box
          component="button"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            "display": "flex",
            "alignItems": "center",
            "gap": "8px",
            "background": "none",
            "border": `1px solid ${palette.border.light}`,
            "borderRadius": "8px",
            "px": "12px",
            "py": "7px",
            "cursor": "pointer",
            "&:hover": { borderColor: palette.text.tertiary },
          }}
        >
          {ModelIcon && <ModelIcon width={16} height={16} />}
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.primary }}>
            {selectedModel ? selectedModel.name : "Select model"}
          </Typography>
          <ChevronDown size={14} color={palette.text.tertiary} strokeWidth={1.5} />
        </Box>

        {/* Dropdown */}
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
          PaperProps={{
            sx: {
              mt: "4px",
              minWidth: 260,
              borderRadius: "8px",
              border: `1px solid ${palette.border.light}`,
              boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
            },
          }}
          transformOrigin={{ horizontal: "left", vertical: "top" }}
          anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
        >
          <Box sx={{ px: "12px", py: "8px" }}>
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 600,
                color: palette.text.tertiary,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Saved Models
            </Typography>
          </Box>
          <Divider />
          {savedModels.length === 0 && (
            <MenuItem disabled sx={{ fontSize: 13, color: palette.text.tertiary }}>
              No saved models yet
            </MenuItem>
          )}
          {savedModels.map((m) => {
            const Icon = getModelIcon(m);
            const isSelected = m.id === selectedModelId;
            return (
              <MenuItem
                key={m.id}
                selected={isSelected}
                onClick={() => {
                  setSelectedModelId(m.id);
                  setMessages([]);
                  setError(null);
                  setAnchorEl(null);
                }}
                sx={{
                  "gap": "10px",
                  "py": "8px",
                  "px": "12px",
                  "&.Mui-selected": { backgroundColor: `${palette.brand.primary}12` },
                }}
              >
                {Icon ? (
                  <Icon width={16} height={16} style={{ flexShrink: 0 }} />
                ) : (
                  <Box sx={{ width: 16 }} />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontSize={13} fontWeight={isSelected ? 500 : 400} noWrap>
                    {m.name}
                  </Typography>
                  <Typography fontSize={11} color={palette.text.tertiary}>
                    {m.provider}
                  </Typography>
                </Box>
                {isSelected && (
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: palette.brand.primary,
                      flexShrink: 0,
                    }}
                  />
                )}
              </MenuItem>
            );
          })}
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              onNavigateToModels();
            }}
            sx={{ gap: "8px", py: "8px", px: "12px", color: palette.brand.primary }}
          >
            <Plus size={14} strokeWidth={1.5} />
            <Typography fontSize={13} fontWeight={500} color={palette.brand.primary}>
              Add model
            </Typography>
          </MenuItem>
        </Menu>

        {/* Clear */}
        {hasMessages && (
          <Tooltip title="Clear conversation">
            <IconButton
              size="small"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              sx={{
                "color": palette.text.tertiary,
                "borderRadius": "6px",
                "p": "6px",
                "&:hover": {
                  backgroundColor: palette.background.fill,
                  color: palette.text.secondary,
                },
              }}
            >
              <Trash2 size={15} strokeWidth={1.5} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* ── Spacer above (empty state only) — pushes content to center ─── */}
      {!hasMessages && <Box sx={{ flex: 1 }} />}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!hasMessages && !loading && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            pb: "28px",
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: "12px",
              backgroundColor: palette.background.fill,
              border: `1px solid ${palette.border.light}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {ModelIcon ? (
              <ModelIcon width={22} height={22} />
            ) : (
              <Bot size={22} color={palette.text.tertiary} strokeWidth={1.2} />
            )}
          </Box>
          <Typography fontSize={15} fontWeight={500} color={palette.text.secondary}>
            {savedModels.length === 0
              ? "Add a model first"
              : `Chat with ${selectedModel?.name ?? "your model"}`}
          </Typography>
          <Typography fontSize={13} color={palette.text.tertiary} textAlign="center" maxWidth={320}>
            {savedModels.length === 0
              ? 'Click "Add model" above to save a model, then start chatting.'
              : "Send a message or attach a file below."}
          </Typography>
        </Box>
      )}

      {/* ── Chat thread (only while conversation is active) ───────────────── */}
      <Box sx={{ flex: hasMessages ? 1 : 0, overflowY: hasMessages ? "auto" : "hidden" }}>
        <Box sx={{ maxWidth: 760, mx: "auto", px: "2px" }}>
          {messages.map((msg, idx) => (
            <Box key={idx} sx={{ py: "10px" }}>
              {msg.role === "user" ? (
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Box
                    sx={{
                      maxWidth: "75%",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      alignItems: "flex-end",
                    }}
                  >
                    {/* Image previews */}
                    {msg.images && msg.images.length > 0 && (
                      <Box
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px",
                          justifyContent: "flex-end",
                        }}
                      >
                        {msg.images.map((src, i) => (
                          <Box
                            key={i}
                            component="img"
                            src={src}
                            alt={`attachment-${i}`}
                            sx={{
                              maxWidth: 220,
                              maxHeight: 180,
                              borderRadius: "12px 12px 4px 12px",
                              objectFit: "cover",
                              border: `2px solid ${palette.brand.primary}`,
                              display: "block",
                            }}
                          />
                        ))}
                      </Box>
                    )}
                    {/* Text — strip [Image: …] markers since image is shown above */}
                    {msg.content.replace(/\[Image:[^\]]*\]/g, "").trim() && (
                      <Box
                        sx={{
                          backgroundColor: palette.brand.primary,
                          color: "#fff",
                          borderRadius: "18px 18px 4px 18px",
                          px: "16px",
                          py: "10px",
                          fontSize: 13,
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {msg.content.replace(/\[Image:[^\]]*\]/g, "").trim()}
                      </Box>
                    )}
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "8px",
                      backgroundColor: palette.background.fill,
                      border: `1px solid ${palette.border.light}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      mt: "2px",
                    }}
                  >
                    {ModelIcon ? (
                      <ModelIcon width={14} height={14} />
                    ) : (
                      <Bot size={14} color={palette.text.tertiary} strokeWidth={1.5} />
                    )}
                  </Box>
                  <Box
                    sx={{
                      "flex": 1,
                      "fontSize": 13,
                      "lineHeight": 1.7,
                      "color": palette.text.primary,
                      "& p": { margin: 0, mb: "10px" },
                      "& p:last-child": { mb: 0 },
                      "& pre": {
                        backgroundColor: palette.background.hover,
                        p: "12px 14px",
                        borderRadius: "6px",
                        overflowX: "auto",
                        fontSize: 12,
                        my: "10px",
                      },
                      "& code": {
                        backgroundColor: palette.background.hover,
                        px: "4px",
                        py: "1px",
                        borderRadius: "4px",
                        fontSize: 12,
                      },
                      "& h1,& h2,& h3": { mt: "14px", mb: "6px", fontWeight: 600 },
                      "& ul,& ol": { pl: "20px", mb: "10px", mt: 0 },
                      "& li": { mb: "4px" },
                    }}
                  >
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </Box>
                </Box>
              )}
            </Box>
          ))}

          {loading && (
            <Box sx={{ display: "flex", gap: "10px", alignItems: "center", py: "10px" }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "8px",
                  backgroundColor: palette.background.fill,
                  border: `1px solid ${palette.border.light}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {ModelIcon ? (
                  <ModelIcon width={14} height={14} />
                ) : (
                  <Bot size={14} color={palette.text.tertiary} strokeWidth={1.5} />
                )}
              </Box>
              <Stack direction="row" alignItems="center" gap="6px">
                <CircularProgress size={12} sx={{ color: palette.brand.primary }} />
                <Typography fontSize={12} color={palette.text.tertiary}>
                  Thinking…
                </Typography>
              </Stack>
            </Box>
          )}

          {error && (
            <Box
              sx={{
                mt: "6px",
                px: "14px",
                py: "10px",
                borderRadius: "8px",
                border: "1px solid #FECACA",
                backgroundColor: "#FFF5F5",
              }}
            >
              <Typography fontSize={12} color="#DC2626">
                {error}
              </Typography>
            </Box>
          )}
        </Box>
        <div ref={bottomRef} />
      </Box>

      {/* ── Spacer below (empty state only) — keeps composer slightly above center ── */}
      {!hasMessages && <Box sx={{ flex: 1.4 }} />}

      {/* ── Composer ─────────────────────────────────────────────────────── */}
      <Box sx={{ flexShrink: 0, pt: "12px", maxWidth: 760, width: "100%", mx: "auto", px: "2px" }}>
        {/* Attachment previews with grey container */}
        {attachments.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              mb: "8px",
              p: "10px",
              backgroundColor: palette.background.fill,
              border: `1px solid ${palette.border.light}`,
              borderRadius: "10px",
            }}
          >
            {attachments.map((att, idx) => (
              <Box
                key={idx}
                sx={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: palette.background.main,
                  border: `1px solid ${palette.border.light}`,
                  borderRadius: "8px",
                  overflow: "hidden",
                  ...(att.type === "image"
                    ? { width: 64, height: 64 }
                    : { px: "10px", py: "6px", maxWidth: 180 }),
                }}
              >
                {att.type === "image" ? (
                  <img
                    src={att.preview}
                    alt={att.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <>
                    <FileText
                      size={14}
                      color={palette.text.tertiary}
                      strokeWidth={1.5}
                      style={{ flexShrink: 0 }}
                    />
                    <Typography
                      fontSize={11}
                      color={palette.text.secondary}
                      noWrap
                      sx={{ maxWidth: 120 }}
                    >
                      {att.name}
                    </Typography>
                  </>
                )}
                <IconButton
                  size="small"
                  onClick={() => removeAttachment(idx)}
                  sx={{
                    "position": "absolute",
                    "top": 2,
                    "right": 2,
                    "width": 18,
                    "height": 18,
                    "backgroundColor": "rgba(0,0,0,0.45)",
                    "color": "#fff",
                    "p": 0,
                    "&:hover": { backgroundColor: "rgba(0,0,0,0.65)" },
                  }}
                >
                  <X size={10} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        {/* Input box */}
        <Box
          sx={{
            "display": "flex",
            "alignItems": "center",
            "gap": "6px",
            "border": `1.5px solid ${dictating ? "#EF4444" : palette.border.light}`,
            "borderRadius": "14px",
            "px": "10px",
            "py": "8px",
            "backgroundColor": palette.background.main,
            "transition": "border-color 0.15s",
            "&:focus-within": { borderColor: dictating ? "#EF4444" : palette.brand.primary },
          }}
        >
          {/* Attach */}
          <Tooltip
            title={
              !selectedModelId
                ? "Select a model first"
                : !visionOk
                  ? "This model is text-only — images not supported"
                  : "Attach image or document"
            }
          >
            <span>
              <IconButton
                size="small"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || !selectedModelId || !visionOk}
                sx={{
                  "color": palette.text.tertiary,
                  "borderRadius": "6px",
                  "p": "4px",
                  "flexShrink": 0,
                  "&:hover": { backgroundColor: palette.background.fill },
                  "&:disabled": { opacity: 0.35 },
                }}
              >
                <Paperclip size={16} strokeWidth={1.5} />
              </IconButton>
            </span>
          </Tooltip>

          {/* Mic — pulse animation when dictating */}
          <Tooltip title={dictating ? "Stop dictation" : "Dictate message"}>
            <span>
              <IconButton
                size="small"
                onClick={toggleDictation}
                disabled={loading || !selectedModelId}
                sx={{
                  "color": dictating ? "#EF4444" : palette.text.tertiary,
                  "borderRadius": "50%",
                  "p": "4px",
                  "flexShrink": 0,
                  "transition": "color 0.15s",
                  "animation": dictating ? "vw-mic-pulse 1.2s ease-out infinite" : "none",
                  "&:hover": { backgroundColor: palette.background.fill },
                  "&:disabled": { opacity: 0.35 },
                }}
              >
                <Mic size={16} strokeWidth={1.5} />
              </IconButton>
            </span>
          </Tooltip>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              dictating
                ? "Listening…"
                : savedModels.length === 0
                  ? "Add a model first…"
                  : "Message…"
            }
            disabled={loading || !selectedModelId || savedModels.length === 0}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
              fontSize: 13,
              lineHeight: 1.6,
              backgroundColor: "transparent",
              color: palette.text.primary,
              padding: 0,
              minHeight: 22,
              overflow: "hidden",
            }}
          />

          {/* Send */}
          <IconButton
            onClick={sendMessage}
            disabled={!canSend}
            sx={{
              "backgroundColor": canSend ? palette.brand.primary : palette.background.fill,
              "color": canSend ? "#fff" : palette.text.disabled,
              "width": 32,
              "height": 32,
              "borderRadius": "8px",
              "flexShrink": 0,
              "transition": "background-color 0.15s",
              "&:hover": {
                backgroundColor: canSend ? palette.brand.primaryHover : palette.background.fill,
              },
            }}
          >
            <Send size={14} strokeWidth={1.5} />
          </IconButton>
        </Box>

        <Typography
          sx={{ fontSize: 11, color: palette.text.tertiary, textAlign: "center", mt: "6px" }}
        >
          {selectedModel
            ? `${selectedModel.provider} · ${selectedModel.name}`
            : "Select a model to start"}
        </Typography>
      </Box>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </Box>
  );
}
