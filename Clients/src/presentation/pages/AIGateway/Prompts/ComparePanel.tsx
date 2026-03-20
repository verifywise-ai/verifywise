import { useState, useRef, useEffect } from "react";
import { Box, Typography, IconButton, TextareaAutosize } from "@mui/material";
import { Send, GitCompareArrows } from "lucide-react";
import Select from "../../../components/Inputs/Select";
import palette from "../../../themes/palette";
import { resolveMessageVariables, streamPromptTest, StreamPromptTestResult } from "../shared";

interface Message { role: string; content: string }
interface Version {
  id: number;
  version: number;
  content: Message[];
  variables: string[] | null;
  model: string | null;
  config: Record<string, any> | null;
}

interface ComparePanelProps {
  versions: Version[];
  endpoints: Array<{ slug: string; display_name: string }>;
  selectedEndpoint: string;
  detectedVars: string[];
  variableValues: Record<string, string>;
}

export default function ComparePanel({
  versions,
  endpoints,
  selectedEndpoint: parentEndpoint,
  detectedVars,
  variableValues,
}: ComparePanelProps) {
  const [versionA, setVersionA] = useState<number | "">("");
  const [versionB, setVersionB] = useState<number | "">("");
  const [localEndpoint, setLocalEndpoint] = useState(parentEndpoint);
  const selectedEndpoint = localEndpoint || parentEndpoint;
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [resultA, setResultA] = useState<StreamPromptTestResult | null>(null);
  const [resultB, setResultB] = useState<StreamPromptTestResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const versionItems = versions.map((v) => ({
    _id: String(v.version),
    name: `v${v.version}${v.model ? ` — ${v.model}` : ""}`,
  }));

  const runStream = (
    ver: Version,
    userMsg: string,
    setResult: React.Dispatch<React.SetStateAction<StreamPromptTestResult | null>>,
    signal: AbortSignal
  ) => {
    const resolved = resolveMessageVariables(ver.content || [], variableValues);
    const testMessages = [...resolved];
    if (userMsg.trim()) testMessages.push({ role: "user", content: userMsg.trim() });

    setResult({ content: "", tokens: 0, cost: 0, latency: 0 });

    return streamPromptTest({
      endpointSlug: selectedEndpoint,
      messages: testMessages,
      variables: variableValues,
      config: ver.config || {},
      onDelta: (accumulated) => setResult((prev) => ({ ...prev!, content: accumulated })),
      signal,
    }).then((r) => setResult(r));
  };

  const handleSend = async () => {
    if (!selectedEndpoint || !versionA || !versionB) return;
    const verA = versions.find((v) => v.version === Number(versionA));
    const verB = versions.find((v) => v.version === Number(versionB));
    if (!verA || !verB) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setIsSending(true);
    setResultA(null);
    setResultB(null);
    const msg = chatInput;
    setChatInput("");

    try {
      await Promise.all([
        runStream(verA, msg, setResultA, signal),
        runStream(verB, msg, setResultB, signal),
      ]);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        const fallback = { content: `Error: ${err.message}`, tokens: 0, cost: 0, latency: 0 };
        setResultA((prev) => prev || fallback);
        setResultB((prev) => prev || fallback);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Version selectors */}
      <Box sx={{ p: "16px", borderBottom: `1px solid ${palette.border.light}`, flexShrink: 0 }}>
        <Box sx={{ display: "flex", gap: "16px", mb: detectedVars.length > 0 ? "16px" : 0 }}>
          <Select
            id="compare-select-left"
            label="Version A"
            value={String(versionA)}
            onChange={(e) => setVersionA(Number(e.target.value))}
            items={versionItems}
            placeholder="Select version"
            sx={{ flex: 1 }}
          />
          <Select
            id="compare-select-right"
            label="Version B"
            value={String(versionB)}
            onChange={(e) => setVersionB(Number(e.target.value))}
            items={versionItems}
            placeholder="Select version"
            sx={{ flex: 1 }}
          />
        </Box>
        <Typography fontSize={13} fontWeight={500} color="text.secondary" mt="8px">Endpoint</Typography>
        <Select
          id="compare-select-endpoint"
          value={selectedEndpoint}
          onChange={(e) => setLocalEndpoint(e.target.value as string)}
          items={endpoints.map((e) => ({ _id: e.slug, name: `${e.display_name} (${e.slug})` }))}
          placeholder="Select endpoint"
          sx={{ width: "100%" }}
        />
        <Typography fontSize={11} color="text.disabled" mt="4px">
          {detectedVars.length > 0
            ? "Variable values from the chat tab will be used for both versions."
            : "Pick two prompt versions to compare their responses to the same input."}
        </Typography>
      </Box>

      {/* Results */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Column A */}
        <Box sx={{ flex: 1, borderRight: `1px solid ${palette.border.light}`, overflow: "auto", p: "16px" }}>
          <Typography fontSize={11} fontWeight={600} color="text.secondary" mb="8px">
            {versionA ? `v${versionA}` : "Version A"}
          </Typography>
          {resultA ? (
            <>
              <Box sx={{ bgcolor: "#F9FAFB", borderRadius: "4px", p: "16px", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {resultA.content || (isSending ? "..." : "")}
              </Box>
              {resultA.latency > 0 && (
                <Box sx={{ display: "flex", gap: "16px", mt: "8px" }}>
                  <Typography fontSize={11} color="text.secondary">{resultA.latency}ms</Typography>
                  {resultA.tokens > 0 && <Typography fontSize={11} color="text.secondary">{resultA.tokens} tokens</Typography>}
                  {resultA.cost > 0 && <Typography fontSize={11} color="text.secondary">${resultA.cost.toFixed(4)}</Typography>}
                </Box>
              )}
            </>
          ) : !isSending ? (
            <Box sx={{ textAlign: "center", py: "32px" }}>
              <GitCompareArrows size={24} strokeWidth={1} color={palette.border.dark} style={{ marginBottom: 8 }} />
              <Typography fontSize={12} color="text.disabled">Select versions and send a message</Typography>
            </Box>
          ) : null}
        </Box>

        {/* Column B */}
        <Box sx={{ flex: 1, overflow: "auto", p: "16px" }}>
          <Typography fontSize={11} fontWeight={600} color="text.secondary" mb="8px">
            {versionB ? `v${versionB}` : "Version B"}
          </Typography>
          {resultB ? (
            <>
              <Box sx={{ bgcolor: "#F9FAFB", borderRadius: "4px", p: "16px", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {resultB.content || (isSending ? "..." : "")}
              </Box>
              {resultB.latency > 0 && (
                <Box sx={{ display: "flex", gap: "16px", mt: "8px" }}>
                  <Typography fontSize={11} color="text.secondary">{resultB.latency}ms</Typography>
                  {resultB.tokens > 0 && <Typography fontSize={11} color="text.secondary">{resultB.tokens} tokens</Typography>}
                  {resultB.cost > 0 && <Typography fontSize={11} color="text.secondary">${resultB.cost.toFixed(4)}</Typography>}
                </Box>
              )}
            </>
          ) : !isSending ? (
            <Box sx={{ textAlign: "center", py: "32px" }}>
              <Typography fontSize={12} color="text.disabled">Output appears here</Typography>
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* Chat input */}
      <Box sx={{ display: "flex", gap: "8px", p: "16px", borderTop: `1px solid ${palette.border.light}`, bgcolor: "background.paper", flexShrink: 0 }}>
        <TextareaAutosize
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a message to compare..."
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
          onClick={handleSend}
          disabled={isSending || !selectedEndpoint || !versionA || !versionB}
          sx={{
            bgcolor: "primary.main",
            color: "#fff",
            width: 34,
            height: 34,
            alignSelf: "flex-end",
            "&:hover": { bgcolor: "primary.dark" },
            "&:disabled": { bgcolor: "#E4E7EC", color: "#98A2B3" },
          }}
        >
          <Send size={14} strokeWidth={1.5} />
        </IconButton>
      </Box>
    </Box>
  );
}
