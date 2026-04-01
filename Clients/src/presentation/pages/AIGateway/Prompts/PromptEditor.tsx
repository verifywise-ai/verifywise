import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Drawer,
  TextareaAutosize,
  Slider,
} from "@mui/material";
import {
  Plus,
  Trash2,
  History,
  Send,
  GripVertical,
  Settings2,
  Upload,
  X,
  GitCompareArrows,
  Tag,
  Link2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import palette from "../../../themes/palette";
import {
  useCardSx, useGatewayModels, ProviderIcon,
  extractVars, extractPromptRefs, resolveMessageVariables,
  getLabelVariant, streamPromptTest,
} from "../shared";
import VersionDiffModal from "./VersionDiffModal";
import ComparePanel from "./ComparePanel";
import TestDatasetPanel from "./TestDatasetPanel";

interface Message { role: string; content: string; _id?: string }

/** Sortable wrapper for a message block */
function SortableMessageBlock({
  msg,
  idx,
  total,
  cardSx,
  onUpdate,
  onRemove,
}: {
  msg: Message;
  idx: number;
  total: number;
  cardSx: any;
  onUpdate: (index: number, field: "role" | "content", value: string) => void;
  onRemove: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: msg._id || String(idx),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box ref={setNodeRef} style={style} sx={{ ...cardSx, p: 0, overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          px: "16px",
          py: "8px",
          borderBottom: `1px solid ${palette.border.light}`,
          bgcolor: "#F9FAFB",
        }}
      >
        <Box {...attributes} {...listeners} sx={{ cursor: "grab", display: "flex", alignItems: "center" }}>
          <GripVertical size={14} strokeWidth={1.5} color={palette.border.dark} />
        </Box>
        <select
          value={msg.role}
          onChange={(e) => onUpdate(idx, "role", e.target.value)}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 13,
            fontWeight: 600,
            textTransform: "uppercase",
            color: "#344054",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="system">SYSTEM</option>
          <option value="user">USER</option>
          <option value="assistant">ASSISTANT</option>
        </select>
        <Box sx={{ flex: 1 }} />
        {total > 1 && (
          <IconButton size="small" onClick={() => onRemove(idx)}>
            <Trash2 size={13} strokeWidth={1.5} />
          </IconButton>
        )}
      </Box>
      <TextareaAutosize
        value={msg.content}
        onChange={(e) => onUpdate(idx, "content", e.target.value)}
        minRows={3}
        placeholder={
          msg.role === "system"
            ? "You are a helpful assistant that... Use {{variables}} for dynamic values, e.g. You are a {{role}} expert in {{domain}}."
            : msg.role === "user"
              ? "Write a sample user message with {{variables}}, e.g. Summarize {{topic}} in {{style}} style."
              : "Write a sample assistant response to guide the AI's behavior through few-shot examples."
        }
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          resize: "vertical",
          padding: 16,
          fontSize: 13,
          fontFamily: "inherit",
          lineHeight: 1.6,
          boxSizing: "border-box",
        }}
      />
    </Box>
  );
}

interface Version {
  id: number;
  version: number;
  content: Message[];
  variables: string[] | null;
  model: string | null;
  config: Record<string, any> | null;
  status: "draft" | "published";
  published_at: string | null;
  published_by_name: string | null;
  created_by_name: string | null;
  created_at: string;
  commit_message?: string | null;
}

interface PromptLabel {
  id: number;
  label_name: string;
  version_id: number;
  version_number?: number;
  assigned_by_name?: string;
}

interface PromptData {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  published_version: number | null;
}

interface ChatMessage { role: "user" | "assistant"; content: string }

type TestTab = "chat" | "compare" | "test-set";

export default function PromptEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cardSx = useCardSx();

  const [prompt, setPrompt] = useState<PromptData | null>(null);
  const [loading, setLoading] = useState(true);

  const idCounter = useRef(1);
  const assignId = () => `msg-${idCounter.current++}`;

  // Editor state
  const [messages, setMessages] = useState<Message[]>([{ role: "system", content: "", _id: "msg-0" }]);
  const [model, setModel] = useState("");
  const [config, setConfig] = useState<Record<string, any>>({});
  const { providers: gwProviders, getModelsForProvider: gwModelsFor } = useGatewayModels();
  // Build flat model list from all providers for the model metadata dropdown
  const allModelItems = gwProviders.flatMap((p) => gwModelsFor(p));
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [currentStatus, setCurrentStatus] = useState<"draft" | "published">("draft");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Config modal
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tempConfig, setTempConfig] = useState<Record<string, any>>({});

  // Commit message modal (Feature 6)
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const pendingSaveRef = useRef<Message[] | null>(null);

  // Version history drawer
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);

  // Diff modal (Feature 1)
  const [diffVersionA, setDiffVersionA] = useState<Version | null>(null);
  const [diffVersionB, setDiffVersionB] = useState<Version | null>(null);
  const [isDiffOpen, setIsDiffOpen] = useState(false);

  // Labels (Feature 2)
  const [labels, setLabels] = useState<PromptLabel[]>([]);
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [labelVersionId, setLabelVersionId] = useState<number | null>(null);
  const [newLabelName, setNewLabelName] = useState("");

  // Test panel state
  const [testTab, setTestTab] = useState<TestTab>("chat");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastMetrics, setLastMetrics] = useState<{ latency?: number; tokens?: number; cost?: number } | null>(null);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const detectedVars = useMemo(() => extractVars(messages), [messages]);
  const detectedRefs = useMemo(() => extractPromptRefs(messages), [messages]);

  const loadVersionIntoEditor = (v: Version) => {
    setMessages(
      v.content?.length
        ? v.content.map((m) => ({ ...m, _id: assignId() }))
        : [{ role: "system", content: "", _id: assignId() }]
    );
    setModel(v.model || "");
    setConfig(v.config || {});
    setCurrentVersion(v.version);
    setCurrentStatus(v.status);
  };

  const loadPrompt = useCallback(async () => {
    if (!id) return;
    try {
      const [promptRes, versionsRes, endpointsRes, labelsRes] = await Promise.all([
        apiServices.get<Record<string, any>>(`/ai-gateway/prompts/${id}`),
        apiServices.get<Record<string, any>>(`/ai-gateway/prompts/${id}/versions`),
        apiServices.get<Record<string, any>>("/ai-gateway/endpoints"),
        apiServices.get<Record<string, any>>(`/ai-gateway/prompts/${id}/labels`),
      ]);
      setPrompt(promptRes?.data?.prompt || promptRes?.data?.data);
      const vers: Version[] = versionsRes?.data?.versions || versionsRes?.data?.data || [];
      setVersions(vers);
      setEndpoints((endpointsRes?.data?.endpoints || []).filter((e: any) => e.is_active));
      setLabels(labelsRes?.data?.labels || labelsRes?.data?.data || []);
      if (vers.length > 0) loadVersionIntoEditor(vers[0]);
    } catch { /* silently handle */ }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadPrompt(); }, [loadPrompt]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);
  useEffect(() => { return () => { chatAbortRef.current?.abort(); }; }, []);

  // ─── Editor actions ─────────────────────────────────────────────────

  const addMessage = () => setMessages((p) => [...p, { role: "user", content: "", _id: assignId() }]);

  const updateMessage = (index: number, field: "role" | "content", value: string) => {
    setMessages((p) => p.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const removeMessage = (index: number) => setMessages((p) => p.filter((_, i) => i !== index));

  const saveVersion = async (msgs: Message[], commitMsg?: string | null) => {
    if (!id || msgs.length === 0) return;
    setIsSaving(true);
    try {
      const res = await apiServices.post<Record<string, any>>(`/ai-gateway/prompts/${id}/versions`, {
        content: msgs,
        model: model || null,
        config: Object.keys(config).length > 0 ? config : null,
        commit_message: commitMsg || null,
      });
      const newVer = res?.data?.version || res?.data?.data;
      if (newVer) {
        setCurrentVersion(newVer.version);
        setCurrentStatus("draft");
        setVersions((prev) => [newVer, ...prev]);
      }
    } catch { /* silently handle */ }
    finally { setIsSaving(false); }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = messages.findIndex((m) => m._id === active.id);
    const newIndex = messages.findIndex((m) => m._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(messages, oldIndex, newIndex);
    setMessages(reordered);
    saveVersion(reordered);
  };

  // Feature 6: Save triggers commit message modal
  const handleSave = () => {
    pendingSaveRef.current = messages;
    setCommitMessage("");
    setIsCommitModalOpen(true);
  };

  const handleCommitSave = () => {
    if (pendingSaveRef.current) {
      saveVersion(pendingSaveRef.current, commitMessage || null);
      pendingSaveRef.current = null;
    }
    setIsCommitModalOpen(false);
  };

  const handleCommitSkip = () => {
    if (pendingSaveRef.current) {
      saveVersion(pendingSaveRef.current, null);
      pendingSaveRef.current = null;
    }
    setIsCommitModalOpen(false);
  };

  const publishVersion = async (versionNumber: number) => {
    if (!id) return;
    try {
      const res = await apiServices.post<Record<string, any>>(`/ai-gateway/prompts/${id}/versions/${versionNumber}/publish`);
      const published = res?.data?.version || res?.data?.data;
      if (published) {
        setVersions((prev) =>
          prev.map((v) =>
            v.version === published.version
              ? { ...v, status: "published", published_at: published.published_at }
              : { ...v, status: "draft", published_at: null }
          )
        );
        setPrompt((p) => p ? { ...p, published_version: published.version } : p);
        if (versionNumber === currentVersion) setCurrentStatus("published");
      }
    } catch { /* silently handle */ }
  };

  const handlePublish = async () => {
    if (!currentVersion) return;
    setIsPublishing(true);
    await publishVersion(currentVersion);
    setIsPublishing(false);
  };

  const handlePublishVersion = async (versionNumber: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await publishVersion(versionNumber);
  };

  // Feature 1: Diff
  const handleCompareVersion = (v: Version, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = versions.find((ver) => ver.version === currentVersion);
    if (!current) return;
    setDiffVersionA(current);
    setDiffVersionB(v);
    setIsDiffOpen(true);
  };

  // Feature 2: Labels
  const handleAssignLabel = async () => {
    if (!id || !labelVersionId || !newLabelName.trim()) return;
    try {
      await apiServices.put(`/ai-gateway/prompts/${id}/labels/${newLabelName.trim().toLowerCase()}`, {
        version_id: labelVersionId,
      });
      // Refresh labels
      const labelsRes = await apiServices.get<Record<string, any>>(`/ai-gateway/prompts/${id}/labels`);
      setLabels(labelsRes?.data?.labels || labelsRes?.data?.data || []);
      setIsLabelModalOpen(false);
      setNewLabelName("");
    } catch { /* silently handle */ }
  };

  const handleRemoveLabel = async (labelName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!id) return;
    try {
      await apiServices.delete(`/ai-gateway/prompts/${id}/labels/${labelName}`);
      setLabels((prev) => prev.filter((l) => l.label_name !== labelName));
    } catch { /* silently handle */ }
  };

  const openLabelModal = (versionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLabelVersionId(versionId);
    setNewLabelName("");
    setIsLabelModalOpen(true);
  };

  // ─── Test panel ─────────────────────────────────────────────────────

  const handleSendTest = async () => {
    if (!selectedEndpoint) return;

    const resolved = resolveMessageVariables(messages, variableValues);
    const testMessages: Message[] = [
      ...resolved,
      ...chatMessages.map((cm) => ({ role: cm.role, content: cm.content })),
    ];
    if (chatInput.trim()) {
      testMessages.push({ role: "user", content: chatInput.trim() });
      setChatMessages((prev) => [...prev, { role: "user", content: chatInput.trim() }]);
      setChatInput("");
    }

    chatAbortRef.current?.abort();
    chatAbortRef.current = new AbortController();

    setIsSending(true);
    setLastMetrics(null);
    setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const result = await streamPromptTest({
        endpointSlug: selectedEndpoint,
        messages: testMessages,
        variables: variableValues,
        config,
        onDelta: (accumulated) => {
          setChatMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: accumulated };
            return updated;
          });
        },
        signal: chatAbortRef.current.signal,
      });

      setLastMetrics({ latency: result.latency, tokens: result.tokens, cost: result.cost });
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message || "Connection failed"}` }]);
      }
    } finally {
      setIsSending(false);
    }
  };

  if (loading) return null;
  if (!prompt) {
    return (
      <Box sx={{ p: "16px" }}>
        <Typography>Prompt not found.</Typography>
        <CustomizableButton text="Back to prompts" onClick={() => navigate("/ai-gateway/prompts")} />
      </Box>
    );
  }

  // Get labels for the currently loaded version
  const currentVersionObj = versions.find((v) => v.version === currentVersion);
  const currentLabels = currentVersionObj
    ? labels.filter((l) => l.version_id === currentVersionObj.id)
    : [];

  return (
    <PageHeaderExtended
      title={
        <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
          {prompt.name}
          {currentVersion && <Chip label={`v${currentVersion}`} variant="info" />}
          <Chip label={currentStatus === "published" ? "Published" : "Draft"} />
          {currentLabels.map((l) => (
            <Chip
              key={l.label_name}
              label={l.label_name}
              variant={getLabelVariant(l.label_name)}
            />
          ))}
        </Stack> as any
      }
      description={prompt.description || "Edit prompt messages, test with variables, and publish versions."}
      tipBoxEntity="ai-gateway-prompts"
      helpArticlePath="ai-gateway/prompts"
      actionButton={
        <Stack direction="row" alignItems="center" gap="8px">
          <CustomizableButton text="Save draft" onClick={handleSave} isDisabled={isSaving} variant="outlined" sx={{ height: 34 }} />
          <CustomizableButton text="Publish" icon={<Upload size={14} strokeWidth={1.5} />} onClick={handlePublish} isDisabled={isPublishing || !currentVersion} sx={{ height: 34 }} />
          <IconButton size="small" onClick={() => setIsHistoryOpen(true)}>
            <History size={16} strokeWidth={1.5} />
          </IconButton>
        </Stack>
      }
    >
      {/* ─── Split panel ───────────────────────────────────────────── */}
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden", border: `1px solid ${palette.border.light}`, borderRadius: "4px" }}>
        {/* ─── LEFT: Editor ──────────────────────────────────────── */}
        <Box sx={{ width: "50%", borderRight: `1px solid ${palette.border.light}`, overflow: "auto", p: "16px" }}>
          {/* Section header */}
          <Typography fontSize={13} fontWeight={500} color="text.secondary" mb="4px">Messages</Typography>
          <Typography fontSize={13} color="text.tertiary" mb="16px">
            Define the message sequence sent to the model. Drag to reorder, use {"{{variables}}"} for dynamic values, and @prompt:slug to compose prompts.
          </Typography>

          {/* Model + config */}
          <Box sx={{ display: "flex", gap: "16px", mb: "16px", alignItems: "flex-end" }}>
            <Select
              id="prompt-model-select"
              label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value as string)}
              items={allModelItems}
              placeholder="Select model"
              sx={{ flex: 1 }}
              getOptionValue={(item) => item._id}
            />
            <IconButton
              size="small"
              onClick={() => { setTempConfig({ ...config }); setIsConfigOpen(true); }}
              sx={{ mb: "4px" }}
            >
              <Settings2 size={16} strokeWidth={1.5} />
            </IconButton>
          </Box>

          {/* Message blocks — drag-droppable */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={messages.map((m) => m._id || "")} strategy={verticalListSortingStrategy}>
              <Stack spacing="16px">
                {messages.map((msg, idx) => (
                  <SortableMessageBlock
                    key={msg._id || idx}
                    msg={msg}
                    idx={idx}
                    total={messages.length}
                    cardSx={cardSx}
                    onUpdate={updateMessage}
                    onRemove={removeMessage}
                  />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>

          {/* Add message */}
          <Box
            onClick={addMessage}
            sx={{ mt: "16px", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}
          >
            <Plus size={14} strokeWidth={1.5} />
            <Typography fontSize={13} fontWeight={500}>Add message</Typography>
          </Box>

          {/* Detected variables */}
          {detectedVars.length > 0 && (
            <Box sx={{ mt: "16px" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <Typography fontSize={12} color="text.secondary" fontWeight={500}>Variables:</Typography>
                {detectedVars.map((v) => (
                  <Chip key={v} label={`{{${v}}}`} variant="info" />
                ))}
              </Box>
              <Typography fontSize={11} color="text.disabled" mt="4px">
                Variables are replaced with values at request time. Set values in the test panel on the right.
              </Typography>
            </Box>
          )}

          {/* Feature 4: Prompt references */}
          {detectedRefs.length > 0 && (
            <Box sx={{ mt: "16px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <Typography fontSize={12} color="text.secondary" fontWeight={500}>Includes:</Typography>
              {detectedRefs.map((ref) => (
                <Box
                  key={ref}
                  onClick={() => {
                    // Navigate by slug — need to find matching prompt
                    // For now, just display as info chip. Users can search by slug.
                  }}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    px: "8px",
                    py: "2px",
                    borderRadius: "4px",
                    border: `1px solid ${palette.border.light}`,
                    bgcolor: "#F0F9FF",
                    cursor: "default",
                  }}
                >
                  <Link2 size={11} strokeWidth={1.5} color="#0284C7" />
                  <Typography fontSize={11} color="#0284C7" fontWeight={500}>@{ref}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* ─── RIGHT: Test panel ─────────────────────────────────── */}
        <Box sx={{ width: "50%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Tab toggle: Chat | Compare | Test set */}
          <Box sx={{ display: "flex", borderBottom: `1px solid ${palette.border.light}`, flexShrink: 0 }}>
            {(["chat", "compare", "test-set"] as TestTab[]).map((tab) => (
              <Box
                key={tab}
                onClick={() => setTestTab(tab)}
                sx={{
                  flex: 1,
                  py: "8px",
                  textAlign: "center",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: testTab === tab ? 600 : 400,
                  color: testTab === tab ? "#13715B" : "text.secondary",
                  borderBottom: testTab === tab ? "2px solid #13715B" : "2px solid transparent",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                {tab === "chat" ? "Chat" : tab === "compare" ? "Compare" : "Test set"}
              </Box>
            ))}
          </Box>

          {/* Chat tab content */}
          {testTab === "chat" && (
            <>
              {/* Endpoint selector + variables */}
              <Box sx={{ p: "16px", borderBottom: `1px solid ${palette.border.light}`, flexShrink: 0 }}>
                <Select
                  id="prompt-endpoint-select"
                  label="Test endpoint"
                  value={selectedEndpoint}
                  onChange={(e) => setSelectedEndpoint(e.target.value as string)}
                  items={endpoints.map((e: any) => ({ _id: e.slug, name: `${e.display_name} (${e.slug})` }))}
                  placeholder="Select endpoint"
                  sx={{ width: "100%" }}
                />
                <Typography fontSize={11} color="text.disabled" mt="4px" mb={detectedVars.length > 0 ? "16px" : 0}>
                  Pick an endpoint to route test requests through. The model and API key come from the endpoint configuration.
                </Typography>
                {detectedVars.length > 0 && (
                  <Stack spacing="8px">
                    <Typography fontSize={12} fontWeight={600} color="text.secondary">Variables</Typography>
                    {detectedVars.map((v) => (
                      <Field
                        key={v}
                        label={v}
                        value={variableValues[v] || ""}
                        onChange={(e) => setVariableValues((prev) => ({ ...prev, [v]: e.target.value }))}
                        placeholder={`Value for {{${v}}}`}
                      />
                    ))}
                  </Stack>
                )}
              </Box>

              {/* Chat area */}
              <Box sx={{ flex: 1, overflow: "auto", p: "16px" }}>
                {chatMessages.length === 0 && (
                  <Box sx={{ textAlign: "center", py: "64px" }}>
                    <Typography fontSize={13} color="text.secondary" fontWeight={500}>Send a message to test this prompt</Typography>
                    <Typography fontSize={12} color="text.disabled" mt="8px" sx={{ maxWidth: 320, mx: "auto" }}>
                      Your message blocks above will be prepended as context. Type a user message below and the model will respond using your prompt template.
                    </Typography>
                  </Box>
                )}
                <Stack spacing="8px">
                  {chatMessages.map((cm, idx) => (
                    <Box key={idx} sx={{ display: "flex", justifyContent: cm.role === "user" ? "flex-end" : "flex-start" }}>
                      <Box
                        sx={{
                          maxWidth: "85%",
                          px: "16px",
                          py: "12px",
                          borderRadius: "4px",
                          fontSize: 13,
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                          bgcolor: cm.role === "user" ? "#EEF4FF" : "#F9FAFB",
                          color: "#344054",
                        }}
                      >
                        {cm.content || (isSending && idx === chatMessages.length - 1 ? "..." : "")}
                      </Box>
                    </Box>
                  ))}
                  <div ref={chatEndRef} />
                </Stack>
              </Box>

              {/* Metrics */}
              {lastMetrics && (
                <Box sx={{ px: "16px", py: "8px", borderTop: `1px solid ${palette.border.light}`, display: "flex", gap: "16px", flexShrink: 0 }}>
                  {lastMetrics.latency != null && <Typography fontSize={11} color="text.secondary">{lastMetrics.latency}ms</Typography>}
                  {(lastMetrics.tokens ?? 0) > 0 && <Typography fontSize={11} color="text.secondary">{lastMetrics.tokens} tokens</Typography>}
                  {(lastMetrics.cost ?? 0) > 0 && <Typography fontSize={11} color="text.secondary">${lastMetrics.cost!.toFixed(4)}</Typography>}
                </Box>
              )}

              {/* Chat input */}
              <Box sx={{ display: "flex", gap: "8px", p: "16px", borderTop: `1px solid ${palette.border.light}`, bgcolor: "background.paper", flexShrink: 0 }}>
                <TextareaAutosize
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendTest(); } }}
                  placeholder="Type a message..."
                  minRows={1}
                  maxRows={4}
                  style={{
                    flex: 1,
                    border: `1px solid ${palette.border.light}`,
                    borderRadius: 4,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    resize: "none",
                    outline: "none",
                  }}
                />
                <IconButton
                  onClick={handleSendTest}
                  disabled={isSending || !selectedEndpoint}
                  sx={{
                    bgcolor: "#13715B",
                    color: "#fff",
                    width: 34,
                    height: 34,
                    alignSelf: "flex-end",
                    "&:hover": { bgcolor: "#0F5A47" },
                    "&:disabled": { bgcolor: "#E4E7EC", color: "#98A2B3" },
                  }}
                >
                  <Send size={14} strokeWidth={1.5} />
                </IconButton>
              </Box>
            </>
          )}

          {/* Compare tab */}
          {testTab === "compare" && (
            <ComparePanel
              versions={versions}
              endpoints={endpoints}
              selectedEndpoint={selectedEndpoint}
              detectedVars={detectedVars}
              variableValues={variableValues}
            />
          )}

          {/* Test set tab */}
          {testTab === "test-set" && id && (
            <TestDatasetPanel
              promptId={id}
              messages={messages}
              detectedVars={detectedVars}
              variableValues={variableValues}
              endpoints={endpoints}
              selectedEndpoint={selectedEndpoint}
              config={config}
            />
          )}
        </Box>
      </Box>

      {/* ─── Config modal ──────────────────────────────────────────── */}
      <StandardModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        title="Model parameters"
        description="Fine-tune how the model generates responses."
        onSubmit={() => { setConfig(tempConfig); setIsConfigOpen(false); }}
        submitButtonText="Apply"
      >
        <Stack spacing="16px">
          <Box>
            <Typography fontSize={13} fontWeight={500} mb="4px">Temperature: {tempConfig.temperature ?? 1.0}</Typography>
            <Typography fontSize={12} color="text.secondary" mb="8px">
              Controls randomness. Lower values (0.0) make responses more focused and deterministic. Higher values (2.0) make output more random and creative.
            </Typography>
            <Slider
              value={tempConfig.temperature ?? 1.0}
              onChange={(_, val) => setTempConfig((p) => ({ ...p, temperature: val as number }))}
              min={0}
              max={2}
              step={0.1}
              valueLabelDisplay="auto"
              sx={{ color: "#13715B" }}
            />
          </Box>
          <Box>
            <Field
              label="Max tokens"
              value={String(tempConfig.max_tokens ?? "")}
              onChange={(e) => setTempConfig((p) => ({ ...p, max_tokens: e.target.value ? parseInt(e.target.value) : undefined }))}
              placeholder="e.g. 4096"
              type="number"
            />
            <Typography fontSize={12} color="text.secondary" mt="4px">
              Maximum number of tokens to generate in the response. Higher values allow longer outputs but increase cost and latency.
            </Typography>
          </Box>
          <Box>
            <Field
              label="Top P"
              value={String(tempConfig.top_p ?? "")}
              onChange={(e) => setTempConfig((p) => ({ ...p, top_p: e.target.value ? parseFloat(e.target.value) : undefined }))}
              placeholder="0.0 - 1.0"
              type="number"
            />
            <Typography fontSize={12} color="text.secondary" mt="4px">
              Nucleus sampling. The model considers tokens with top_p cumulative probability. Lower values (e.g. 0.1) make output more focused. Use either temperature or top P, not both.
            </Typography>
          </Box>
        </Stack>
      </StandardModal>

      {/* ─── Commit message modal (Feature 6) ──────────────────────── */}
      <StandardModal
        isOpen={isCommitModalOpen}
        onClose={() => { setIsCommitModalOpen(false); pendingSaveRef.current = null; }}
        title="Save version"
        description="Optionally describe what changed in this version."
        onSubmit={handleCommitSave}
        submitButtonText="Save"
        maxWidth="480px"
      >
        <Stack spacing="16px">
          <Field
            label="What changed?"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="e.g. Added few-shot examples for edge cases"
          />
          <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
            <CustomizableButton
              text="Skip"
              variant="text"
              onClick={handleCommitSkip}
              sx={{ height: 30, fontSize: 12 }}
            />
          </Box>
        </Stack>
      </StandardModal>

      {/* ─── Label assignment modal (Feature 2) ────────────────────── */}
      <StandardModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        title="Add label"
        description="Assign a label like 'production' or 'staging' to this version."
        onSubmit={handleAssignLabel}
        submitButtonText="Assign"
        maxWidth="400px"
      >
        <Field
          label="Label name"
          value={newLabelName}
          onChange={(e) => setNewLabelName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          placeholder="e.g. production, staging, canary"
        />
      </StandardModal>

      {/* ─── Diff modal (Feature 1) ────────────────────────────────── */}
      <VersionDiffModal
        isOpen={isDiffOpen}
        onClose={() => setIsDiffOpen(false)}
        versionA={diffVersionA}
        versionB={diffVersionB}
      />

      {/* ─── Version history drawer ────────────────────────────────── */}
      <Drawer
        anchor="right"
        open={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        PaperProps={{ sx: { width: 380 } }}
      >
        <Box sx={{ padding: "16px", height: "100%", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "8px" }}>
            <Typography fontSize={15} fontWeight={600}>Version history</Typography>
            <IconButton size="small" onClick={() => setIsHistoryOpen(false)}>
              <X size={16} strokeWidth={1.5} />
            </IconButton>
          </Box>
          <Typography fontSize={12} color="text.secondary" mb="16px">
            Each save creates a new version. Publish a version to make it active on bound endpoints. Click any version to load it into the editor.
          </Typography>

          {/* Versions list */}
          <Stack spacing="12px" sx={{ flex: 1, overflow: "auto" }}>
            {versions.map((v) => {
              const versionLabels = labels.filter((l) => l.version_id === v.id);
              return (
                <Box
                  key={v.id}
                  onClick={() => { loadVersionIntoEditor(v); setIsHistoryOpen(false); }}
                  sx={{
                    p: "16px",
                    cursor: "pointer",
                    borderRadius: "4px",
                    border: v.version === currentVersion
                      ? "1px solid #13715B"
                      : `1px solid ${palette.border.light}`,
                    bgcolor: v.version === currentVersion ? "#F6FEF9" : "background.paper",
                    "&:hover": { bgcolor: v.version === currentVersion ? "#ECFDF3" : "action.hover" },
                    transition: "background-color 150ms ease",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: "8px", mb: "4px", flexWrap: "wrap" }}>
                    <Chip label={`v${v.version}`} variant="info" />
                    <Chip label={v.status === "published" ? "Published" : "Draft"} />
                    {versionLabels.map((l) => (
                      <Box key={l.label_name} sx={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        <Chip label={l.label_name} variant={getLabelVariant(l.label_name)} />
                        <IconButton size="small" onClick={(e) => handleRemoveLabel(l.label_name, e)} sx={{ p: 0, width: 14, height: 14 }}>
                          <X size={10} strokeWidth={2} />
                        </IconButton>
                      </Box>
                    ))}
                    <Box sx={{ flex: 1 }} />
                    {v.status !== "published" && (
                      <CustomizableButton
                        text="Publish"
                        variant="text"
                        onClick={(e) => handlePublishVersion(v.version, e)}
                        sx={{ height: 24, fontSize: 12, minWidth: "auto", px: 1 }}
                      />
                    )}
                  </Box>
                  <Typography fontSize={12} color="text.secondary">
                    {v.created_by_name || "Unknown"} &middot; {displayFormattedDate(v.created_at)}
                  </Typography>
                  {/* Feature 6: Commit message */}
                  {v.commit_message && (
                    <Typography fontSize={11} color="text.secondary" sx={{ fontStyle: "italic", mt: "2px" }}>
                      {v.commit_message}
                    </Typography>
                  )}
                  {v.model && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: "4px", mt: "4px" }}>
                      <ProviderIcon provider={v.model.split("/")[0] || ""} size={12} />
                      <Typography fontSize={11} color="text.secondary">{v.model}</Typography>
                    </Box>
                  )}
                  {/* Action buttons: Compare + Add label */}
                  <Box sx={{ display: "flex", gap: "4px", mt: "8px" }}>
                    {v.version !== currentVersion && (
                      <CustomizableButton
                        text="Compare"
                        icon={<GitCompareArrows size={12} strokeWidth={1.5} />}
                        variant="text"
                        onClick={(e) => handleCompareVersion(v, e)}
                        sx={{ height: 22, fontSize: 11, minWidth: "auto", px: 0.5 }}
                      />
                    )}
                    <CustomizableButton
                      text="Label"
                      icon={<Tag size={12} strokeWidth={1.5} />}
                      variant="text"
                      onClick={(e) => openLabelModal(v.id, e)}
                      sx={{ height: 22, fontSize: 11, minWidth: "auto", px: 0.5 }}
                    />
                  </Box>
                </Box>
              );
            })}
            {versions.length === 0 && (
              <Box sx={{ textAlign: "center", py: "48px" }}>
                <History size={32} strokeWidth={1} color={palette.border.dark} />
                <Typography fontSize={13} color="text.secondary" mt="16px">
                  No versions yet
                </Typography>
                <Typography fontSize={12} color="text.disabled" mt="4px">
                  Click "Save draft" to create your first version.
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>
      </Drawer>
    </PageHeaderExtended>
  );
}
